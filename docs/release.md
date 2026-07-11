# Releasing azula-app

Android ships to Google Play (production track), iOS to TestFlight. Both come from
one shared version, and the whole thing is driven by two GitHub Actions workflows
in `azula-app/.github/workflows/`.

## The two workflows

**`release.yml`** — manual (`workflow_dispatch`), takes a `major | minor | patch`
choice. It reads the newest `v*` tag, bumps it, and pushes the new tag. That is all
it does.

**`publish.yml`** — triggered by that tag push (`on: push: tags: ['v*']`). It
derives the version from the tag it is building and then, in parallel, builds and
ships Android to Play and iOS to TestFlight.

The tag is the handoff. Deciding the version and building it are separate, which
means re-running `publish.yml` on a tag reproduces exactly the same version and
version code — a failed platform build is re-runnable without cutting a new
version. `publish.yml` can also be dispatched by hand against an existing tag, with
a `dry_run` option that builds, signs, exports, and validates against Apple without
publishing to either store.

## Versioning

The version that's live is whatever the newest `v*` tag says, so every release is
exactly one increment ahead of it. There is no query to Play or App Store Connect.

The Android version code is a pure function of the tag:

```
versionCode = major * 10000 + minor * 100 + patch
```

**Keep minor and patch below 100.** Above that the formula stops increasing
monotonically (`1.0.100` and `1.1.0` both give `10100`), and Play rejects a version
code that doesn't increase. `version_lib.sh` refuses to cut or build such a release
rather than silently producing a bad code. Widening the multipliers later is safe —
every code grows; narrowing them is not.

`set_version.sh` stamps the version into both platforms from one place:

- `android-app/module.yaml` → `settings.android.versionCode` / `versionName`
- `ios-app/module.xcodeproj/project.pbxproj` → `MARKETING_VERSION` /
  `CURRENT_PROJECT_VERSION`, in all four build configs (app + AzulaShare, Debug +
  Release). Both `Info.plist`s read those through `$(...)`, so the share extension
  can never ship a version different from its host — Apple rejects that.

The committed values in those files are placeholders (`0.0.0` / `1`); only a
release run's stamped values are real. Nothing is committed back — the tag is the
record.

## Signing

**Android**: signing is **not declared in `android-app/module.yaml`**, on purpose.
Amper's signing is not variant-scoped: with `signing.enabled: true` in the file,
*every* build fails on a machine without a `keystore.properties` — including a plain
debug `./kotlin build -m android-app`, which dies at `:android-app:prepareAndroidDebug`.
That would break every contributor who never cuts a release. Instead the release run
writes `keystore.properties` (from secrets) and then `enable_signing.sh` appends the
signing block to `module.yaml` just before packaging.

To build a signed release locally, do the same two things:

```bash
cat > android-app/keystore.properties <<EOF
storeFile=$HOME/.keystores/azula-upload.jks
storePassword=...
keyAlias=azula
keyPassword=...
EOF
./kotlin tool generate-keystore --properties-file android-app/keystore.properties
bash .github/scripts/enable_signing.sh   # leaves module.yaml dirty; don't commit it
```

(`--properties-file` *reads* the file to populate the keystore — it does not write
it.) `keystore.properties` is gitignored.

**iOS**: automatic signing (`CODE_SIGN_STYLE = Automatic`) plus
`xcodebuild -allowProvisioningUpdates` and the App Store Connect API key. The key is
needed for the TestFlight upload anyway, so signing this way costs no extra secrets
and avoids hand-maintaining two provisioning profiles (the app *and* AzulaShare,
both carrying App Groups and Associated Domains). `DEVELOPMENT_TEAM` is hardcoded in
the Xcode project — it isn't secret (it's published in the AASA as
`<TeamID>.app.azula`), and Xcode won't read it from the environment.

## Secrets

| Secret | What |
| --- | --- |
| `KEYFILE_BASE64` | base64 of the upload keystore `.jks` |
| `STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` | its passwords and alias |
| `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, `GOOGLE_SERVICE_ACCOUNT` | Play upload via Workload Identity Federation (no long-lived JSON key) |
| `APPLE_TEAM_ID` | 10-character Apple team id |
| `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY` | App Store Connect API **Team Key**, role **App Manager** (it creates certs and profiles, not just uploads). The `.p8` downloads exactly once |

## One-time setup outside CI

- **Play**: create the app as `app.azula`, complete the store listing / content
  rating / data safety, enable Play App Signing, and **hand-upload the first AAB** —
  Play rejects the API's first upload for a new package. Use the artifact from a
  `dry_run` run so the version codes line up. A new developer account also has to
  clear Google's closed-testing requirement before production is available; until
  then point `track:` at `internal`.
- **Apple**: register App IDs `app.azula` and `app.azula.AzulaShare` with the App
  Groups capability (and Associated Domains on the host), register the app group
  `group.app.azula` and assign it to both, and create the App Store Connect app
  record. Automatic signing will not create the app group for you.
- **Deep links**: once the app is really signed, put the Play **app-signing**
  SHA-256 into `ANDROID_SHA256` and `<TeamID>.app.azula` into `IOS_APP_ID` in
  `azula-site/src/wellknown.ts` and redeploy, or app links and universal links stop
  verifying. See [deeplinks.md](deeplinks.md).

## Notes

R8 runs on the Android release variant, and Amper exposes no ProGuard/R8
configuration — there is no `-dontwarn` escape hatch. Tink (via
`androidx.security:security-crypto`) references `com.google.errorprone.annotations`
and `javax.annotation.concurrent` without depending on them, so `android-app`
depends on `error_prone_annotations` and `jsr305` purely to keep R8 resolving. Both
are class-retention, so R8 strips them from the shipped app. If a future dependency
fails the release build with "Missing class", this is the same problem and the same
fix.

The publish workflow runs no tests on purpose: `./kotlin check` is known-flaky
headlessly (see [tech-debt.md](tech-debt.md)), and a flaky gate that fails *after*
one of the two stores has already been fed is worse than no gate. Tests belong in PR
CI.
