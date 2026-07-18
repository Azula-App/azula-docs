# Releasing azula-app

Android ships to Google Play (production track), iOS to TestFlight. Both come from
one shared version, and the whole thing is driven by two GitHub Actions workflows
in `azula-app/.github/workflows/`. The version and signing logic lives in portable
`bash` scripts, not the workflow YAML, so moving to a different CI is mostly
re-wiring triggers and secrets — see [Porting to another CI](#porting-to-another-ci).

## The two workflows

**`release.yml`** — manual (`workflow_dispatch`), takes a `major | minor | patch`
choice. It reads the newest `v*` tag, bumps it, and pushes the new tag. That is all
it does. It does **not** auto-run `publish.yml`: a tag pushed by a workflow's
`GITHUB_TOKEN` doesn't trigger other workflows (GitHub's loop-prevention), so
`publish.yml`'s `on: push` never fires from here.

**`publish.yml`** — you **dispatch it by hand** against a tag. It derives the version
from the tag and, in parallel, builds, signs, and **validates** both platforms
(Android AAB, iOS IPA + `altool --validate-app`), uploading each as a workflow
artifact. Run it with `dry_run: true` to build + validate; run it with `dry_run:
false` and a `track` to ship. The store uploads (Play, TestFlight) only ever run on a
manual `dry_run: false` dispatch — never on a push. (Its `on: push` trigger still
exists, but only a human/PAT tag push fires it, and even then it build+validates
only; `release.yml`'s push doesn't reach it.)

So the full release is three explicit acts: **cut** (`release.yml` → new tag),
**validate** (`publish.yml` dispatch, `dry_run: true`), **ship** (`publish.yml`
dispatch, `dry_run: false` + track). "A tag exists" and "release it" are separate on
purpose, so a tag can never auto-ship to a live store. Re-running `publish.yml` on a
tag reproduces exactly the same version and version code — a failed build is
re-runnable, and the eventual ship is the same artifact.

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

## Secrets / credentials

These are the credentials the pipeline needs; they are properties of the Google
Play and Apple accounts, **not of GitHub**. The names below are the GitHub secret
names, but the underlying material moves to any CI unchanged (see [Porting to
another CI](#porting-to-another-ci)). All of them are mirrored into 1Password
(vault *Private*).

| Secret | What | Portable? |
| --- | --- | --- |
| `KEYFILE_BASE64` | base64 of the upload keystore `.jks` | file — fully portable |
| `STORE_PASSWORD`, `KEY_ALIAS`, `KEY_PASSWORD` | its passwords and alias | fully portable |
| `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, `GOOGLE_SERVICE_ACCOUNT` | Play upload via Workload Identity Federation (no long-lived JSON key) | **GitHub-specific** — the WIF provider trusts GitHub's OIDC issuer and is pinned to `Azula-App/azula-app`. Another CI needs its own pool/provider (its issuer, its claim) bound to the *same* service account, or a service-account JSON key instead |
| `APPLE_TEAM_ID` | 10-character Apple team id | fully portable |
| `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY` | App Store Connect API **Team Key**, role **App Manager** (it creates certs and profiles, not just uploads). The `.p8` downloads exactly once | fully portable — a file + two ids, no OIDC involved |

The only genuinely GitHub-shaped credential is the Play one, and only because it
uses OIDC federation to avoid a long-lived key. Everything else is a file or a
string that any secret store can hold.

## One-time setup outside CI

- **Play**: create the app as `app.azula`, complete the store listing / content
  rating / data safety, enable Play App Signing, and **hand-upload the first AAB** —
  Play rejects the API's first upload for a new package. Use the artifact from a
  `dry_run` run so the version codes line up. A new developer account also has to
  clear Google's closed-testing requirement before production is available; until
  then point `track:` at `internal`.

  **Bootstrap trap (hit 2026-07-16, now designed out):** the first bootstrap dry run
  taught us that a `v*` tag push *used* to auto-ship — `publish.yml` triggered on the
  push and ran the uploads, and disabling the workflow first didn't help (re-enabling
  it replayed the queued tag event as a real, non-dry run). That hazard is gone as of
  2026-07-18: the store-upload steps are now gated to `github.event_name ==
  'workflow_dispatch' && !inputs.dry_run`, so a tag push builds/validates only and can
  never ship. Shipping is an explicit manual dispatch. (Only relevant if you ever
  re-add an auto-shipping push trigger — don't.)
- **Apple**: register App IDs `app.azula` and `app.azula.AzulaShare` with the App
  Groups capability (and Associated Domains on the host), register the app group
  `group.app.azula` and assign it to both, and create the App Store Connect app
  record. Automatic signing will not create the app group for you.
- **Deep links** (`azula-site/src/wellknown.ts`, redeploy after any change, or app
  links / universal links stop verifying — see [deeplinks.md](deeplinks.md)):
  - `IOS_APP_ID` — **done**, `EB8N37743E.app.azula` (team id + bundle id; committed).
  - `ANDROID_SHA256` — **still a placeholder.** It must be the Play **app-signing**
    SHA-256 from Play Console (*not* the upload cert), which only exists once the
    first bundle has been uploaded. Copy it in and redeploy the worker.

  The worker hasn't been redeployed yet — do it once `ANDROID_SHA256` is filled so
  both identities go live together.

## Porting to another CI

If we ever leave GitHub Actions (GitLab CI, Buildkite, a self-hosted runner, a
local `bash` release, …), most of this pipeline moves unchanged. The design keeps
the **decisions in portable bash scripts** and leaves only orchestration to the CI.

**Moves as-is — the CI-agnostic core.** Everything under
`azula-app/.github/scripts/` is plain `bash` + `git`, with no GitHub API calls. The
one GitHub coupling is that the version scripts append their outputs to the file in
`$GITHUB_OUTPUT`, and that variable **falls back to `/dev/null`** when unset — so
run them anywhere and read the values off stdout instead:

- `version_lib.sh` — the version math (`parse_semver`, `version_code`), sourced by
  the two below. The `<100` monotonicity guard lives here.
- `get_version.sh` (`BUMP_TYPE=major|minor|patch`) — the "cut the next tag" half.
- `version_from_tag.sh` (`RELEASE_TAG=vX.Y.Z`) — the "derive version from the tag
  being built" half. Rebuilding a tag always reproduces the same version + code.
- `set_version.sh` — stamps both `android-app/module.yaml` and the iOS `pbxproj`.
  Uses `sed -i.bak` / `awk`, the spellings that work on both GNU and BSD.
- `enable_signing.sh` — appends the Android signing block to `module.yaml` at
  build time (see [Signing](#signing) for why it isn't committed).

The **build and upload commands** are equally portable — they're just CLI:

- Android build: `./kotlin package --module android-app --platform android
  --variant release --format aab`, then find the signed AAB at the top of
  `build/tasks/_android-app_bundleAndroid/` (only that copy is signed — not the
  nested `intermediary-bundle.aab`).
- Android upload: anything that speaks the Play Developer API — `fastlane supply`,
  a raw API call, or the `r0adkll/upload-google-play` action we use now (itself a
  thin wrapper). `packageName: app.azula`, the desired `track`.
- iOS: `xcodebuild archive` → `-exportArchive` (with
  `.github/ExportOptions.plist`) → `xcrun altool --upload-app`, on a macOS host.

**Must be reimplemented per CI — the orchestration:**

1. **Two triggers**: a manual "cut a release" entry point (→ `get_version.sh`, then
   push the tag) and a "build the tag" entry point that fires on a `v*` tag push
   (→ `version_from_tag.sh` → build/sign/upload). Keep them separate so the tag
   stays the reproducible handoff.
2. **Secret injection**: hand the [credentials](#secrets--credentials) to the job as
   env/files. Every one is portable except the Play OIDC pair.
3. **Play auth**: the WIF provider is bound to GitHub's OIDC issuer and the
   `Azula-App/azula-app` repo claim, so it does **not** work from another CI as-is.
   Two options — create a second WIF pool/provider for the new CI's OIDC issuer and
   bind it to the *same* `azula-play-publisher` service account (best; still no
   long-lived key), **or** give that service account a JSON key and inject it as one
   secret (simplest; a long-lived credential to guard). Either way the service
   account and its Play Console release permission are unchanged.
4. **Apple signing**: needs a macOS runner with Xcode; the ASC `.p8` + key id +
   issuer id + team id are all portable, and `-allowProvisioningUpdates` means no
   provisioning-profile files to move.
5. **A secret store** with a tag-triggered pipeline. If the new platform can't
   trigger on tags, drive `version_from_tag.sh` from whatever it does expose.

In short: the version/sign logic and the build/upload commands port verbatim; you
re-author the trigger wiring, the secret plumbing, and (only for Play) an OIDC
trust for the new issuer — or swap Play to a JSON key and skip OIDC entirely.

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
