# Release Specification

## Purpose
Defines how azula-app is versioned and shipped to Google Play (production track)
and TestFlight from one shared version, driven by two GitHub Actions workflows
whose version and signing logic lives in portable bash scripts.

## Requirements

### Requirement: Single shared version across platforms
The system SHALL derive both the Android version and the iOS version from a
single newest `v*` git tag, with no separate query to Play or App Store
Connect for the live version.

#### Scenario: Stamping both platforms from one tag
- **WHEN** a release is built from tag `vX.Y.Z`
- **THEN** `set_version.sh` SHALL stamp `X.Y.Z` into `android-app/module.yaml`
  (`versionName`) and into all four iOS build configs' `MARKETING_VERSION`
  (app + AzulaShare, Debug + Release), so the share extension can never ship a
  version different from its host

#### Scenario: Rebuilding the same tag
- **WHEN** `publish.yml` is dispatched again against a tag that was already built
- **THEN** the derived version and Android version code SHALL be identical to the
  first build, making a failed build safely re-runnable

### Requirement: Monotonic Android version code
The Android version code SHALL be computed as
`versionCode = major * 10000 + minor * 100 + patch`, and the tooling SHALL
refuse to cut or build a release where minor or patch is 100 or greater.

#### Scenario: Version code would stop increasing
- **WHEN** a requested version has `minor >= 100` or `patch >= 100`
- **THEN** `version_lib.sh` SHALL refuse to cut or build the release rather than
  produce a version code that does not monotonically increase

### Requirement: Cutting a tag never auto-ships
Pushing or bumping a version tag SHALL NOT by itself upload a build to Play or
TestFlight; shipping SHALL require an explicit manual dispatch.

#### Scenario: release.yml bumps a tag
- **WHEN** `release.yml` is run with a `major | minor | patch` choice
- **THEN** it SHALL only read the newest `v*` tag, bump it, and push the new tag,
  and SHALL NOT trigger `publish.yml` or any store upload

#### Scenario: A tag is pushed by any actor
- **WHEN** a `v*` tag is pushed (by a human, a PAT, or a workflow)
- **THEN** the store-upload steps of `publish.yml` SHALL run only when the
  triggering event is `workflow_dispatch` AND `dry_run` is false, and a plain
  tag push SHALL at most build and validate artifacts

### Requirement: Explicit three-act release flow
The system SHALL separate cutting a release, validating it, and shipping it
into three distinct, individually-invoked acts.

#### Scenario: Validating without shipping
- **WHEN** `publish.yml` is dispatched against a tag with `dry_run: true`
- **THEN** it SHALL build, sign, and validate both platforms (Android AAB; iOS
  IPA + `altool --validate-app`) and upload each as a workflow artifact, without
  uploading to Play or TestFlight

#### Scenario: Shipping
- **WHEN** `publish.yml` is dispatched against a tag with `dry_run: false` and a
  `track`
- **THEN** it SHALL upload the Android AAB to the given Play track and the iOS
  IPA to TestFlight

### Requirement: Android signing kept out of default builds
Android release signing configuration SHALL NOT be declared in
`android-app/module.yaml` in the committed source, so that an unsigned debug
build succeeds on any contributor machine without a keystore.

#### Scenario: Plain debug build on a contributor machine
- **WHEN** a contributor without `keystore.properties` runs
  `./kotlin build -m android-app`
- **THEN** the build SHALL succeed, because no signing block is present in the
  committed `module.yaml`

#### Scenario: Producing a signed release build
- **WHEN** a release build is being packaged
- **THEN** the pipeline SHALL write `keystore.properties` from secrets and run
  `enable_signing.sh` to append the signing block to `module.yaml` at build
  time only, leaving the change uncommitted

### Requirement: iOS uses manual distribution signing
iOS release builds SHALL use manual signing with an imported Apple
Distribution certificate and App Store provisioning profiles, not Xcode
cloud-managed ("automatic") signing.

#### Scenario: Building the iOS release job
- **WHEN** the iOS release job runs
- **THEN** it SHALL import the Distribution certificate (`.p12`) into a
  throwaway keychain, install the app and AzulaShare App Store provisioning
  profiles into the Xcode 16+ profile location, and run
  `xcodebuild archive` with `CODE_SIGN_STYLE=Manual` — all within a single job
  step, since the imported keychain identity does not reliably carry across
  separate steps

#### Scenario: Attempting cloud-managed signing
- **WHEN** the App Store Connect API key used has the App Manager role
- **THEN** Xcode cloud-managed distribution signing SHALL NOT be used, because
  that role cannot mint a cloud distribution certificate

### Requirement: Credentials are store/account properties, not GitHub-specific
Release secrets SHALL be treated as properties of the Google Play and Apple
developer accounts, portable to any CI, except the Play Workload Identity
Federation binding which is GitHub-OIDC-specific.

#### Scenario: Porting the pipeline to another CI
- **WHEN** the release pipeline is ported to a non-GitHub CI
- **THEN** every secret except the Play WIF provider/service-account pair SHALL
  move unchanged as a file or string value, and Play auth SHALL require either a
  new WIF pool bound to the new CI's OIDC issuer or a service-account JSON key

### Requirement: No test gate in the publish workflow
The publish workflow SHALL NOT run the test suite as a release gate.

#### Scenario: publish.yml runs
- **WHEN** `publish.yml` builds a release
- **THEN** it SHALL NOT run `./kotlin check`, because the known-flaky headless
  suite failing after one store has already been fed is worse than no gate;
  tests belong in PR CI instead
