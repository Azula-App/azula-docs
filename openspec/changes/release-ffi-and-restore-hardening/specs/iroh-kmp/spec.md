## MODIFIED Requirements

### Requirement: azula-app consumption wiring
azula-app SHALL depend on the SDK by a version published to Maven Central, in place of `computer.iroh:iroh`, and SHALL initialize the Android context at app startup. The build SHALL NOT rely on `mavenLocal` — Amper resolves this coordinate from Maven Central only and never reads `~/.m2`. Because Central versions are immutable, landing an SDK change in azula-app SHALL require publishing a new `VERSION_NAME` and bumping the coordinate in every module that declares it.

#### Scenario: Wiring the Android app
- **WHEN** `android-app` is built against the SDK
- **THEN** `MainActivity` SHALL call `IrohAndroid.installAndroidContext` before
  any endpoint bind is attempted, and `android-app/module.yaml` SHALL declare
  the SDK dependency so its `.so` files land in the APK

#### Scenario: A local-only SDK build does not reach the app
- **WHEN** the SDK is published with `publishToMavenLocal` alone
- **THEN** azula-app SHALL keep resolving the previously published Maven Central
  artifact, and a version present only in `~/.m2` SHALL fail to resolve

#### Scenario: Landing an SDK change in the app
- **WHEN** a crate change must reach azula-app
- **THEN** a new `VERSION_NAME` SHALL be published to Maven Central and the
  coordinate SHALL be bumped in `network-real/module.yaml` and
  `android-app/module.yaml`

## ADDED Requirements

### Requirement: Android AAR ships R8 consumer keep rules
The `-android` AAR SHALL ship consumer ProGuard/R8 keep rules covering JNA and the generated binding surface, so a consuming app's minified release build retains a working FFI layer. The SDK SHALL deliver these rules rather than expect them from consumers, because consumers cannot supply them: Amper exposes no proguard/R8 configuration surface, and the upstream `jna` AAR ships none.

#### Scenario: Rules travel with the artifact
- **WHEN** the `-android` AAR is published
- **THEN** it SHALL contain a `proguard.txt` holding the JNA and binding keep
  rules

#### Scenario: Consuming release build keeps the FFI working
- **WHEN** a consuming app runs R8 over a release build
- **THEN** `com.sun.jna.Pointer`'s fields SHALL survive unrenamed, so JNA's
  native `initIDs()` lookup succeeds and endpoints can bind

#### Scenario: Consumer code is still minified
- **WHEN** the keep rules are applied
- **THEN** they SHALL be scoped to JNA and the generated bindings, leaving the
  consuming app's own code subject to normal R8 shrinking and obfuscation
