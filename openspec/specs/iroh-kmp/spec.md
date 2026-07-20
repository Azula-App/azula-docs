# iroh-kmp Specification

## Purpose
Defines the contract for `iroh-kmp`, the `app.azula.iroh` Kotlin Multiplatform
SDK that wraps the `iroh` 1.0 Rust crate via UniFFI/Gobley, publishes to
mavenLocal and Maven Central, and is consumed by azula-app in place of
`computer.iroh:iroh`.

## Requirements

### Requirement: Package and artifact identity
The SDK SHALL be published as `app.azula.iroh:iroh-kmp`, with its version
sourced from `iroh-kmp/gradle.properties`'s `VERSION_NAME`, and generated
bindings SHALL live under the `app.azula.iroh` package.

#### Scenario: Consuming the artifact
- **WHEN** azula-app declares a dependency on the SDK
- **THEN** it SHALL reference `app.azula.iroh:iroh-kmp:<VERSION_NAME>` and
  import generated types from the `app.azula.iroh` package

### Requirement: Backward-compatible transport surface
The SDK SHALL preserve the original azula transport surface (`IrohEndpoint.bind`, `nodeId()`, `secretKeyBytes()`, `myTicket()`, `connect()`, `acceptNext()`, `shutdown()`, `sign()`, `IrohStream.sendBytes/recv/finish`, `rttMs()`, and the ticket/signature free functions) byte-for-byte in signature and observable behavior across SDK changes.

#### Scenario: Adding new core-iroh API surface
- **WHEN** new core-iroh functionality (e.g. `IrohConnection`, `bind_with`,
  datagrams) is added to the SDK
- **THEN** the addition SHALL be purely additive, and azula-app/shared SHALL
  recompile unchanged against the existing transport surface

### Requirement: Android runtime prerequisites
The SDK SHALL require consumers on Android to initialize the native DNS
context before binding any endpoint, and SHALL bundle the JNA native
dispatch library so consumers need no manual jniLibs configuration.

#### Scenario: Binding an endpoint on Android without initialization
- **WHEN** an Android consumer calls `IrohEndpoint.bind` before calling
  `IrohAndroid.installAndroidContext(applicationContext)`
- **THEN** DNS resolution (and therefore bind/online) SHALL stall, because
  `ndk_context` has not been initialized with the JavaVM + app context

#### Scenario: Consuming the SDK's Android artifact
- **WHEN** an Android app depends on the published `-android` AAR
- **THEN** the per-ABI `libjnidispatch.so` SHALL already be bundled in the AAR,
  and the consumer SHALL NOT need to add manual jniLibs configuration to avoid
  `UnsatisfiedLinkError`

### Requirement: Build and publish toolchain requirements
Building and publishing the SDK SHALL require JDK 17, Android NDK r28+, and a
Rust toolchain with the Android and iOS targets installed.

#### Scenario: Publishing to mavenLocal
- **WHEN** running `./gradlew publishToMavenLocal` from `iroh-kmp/` with
  `JAVA_HOME` set to a JDK 17 install and `ANDROID_HOME` set
- **THEN** the build SHALL succeed without a signing key present, publishing
  the root KMP metadata plus per-target artifacts (`-android`, `-jvm`,
  `-iosarm64`, `-iossimulatorarm64`, `-iosx64`) to `~/.m2/repository/app/azula/iroh/`

### Requirement: Maven Central publish is tag-driven and host-gated
Publishing to Maven Central SHALL run only on a `v*` tag push, and SHALL run
on a macOS host since it is the only host capable of building every KMP
target (iOS + Android + JVM) in one publication set.

#### Scenario: Cutting a release
- **WHEN** `VERSION_NAME` in `gradle.properties` and `version` in `Cargo.toml`
  are bumped, committed, and tag `vX.Y.Z` is pushed
- **THEN** `iroh-kmp/.github/workflows/publish.yml` SHALL run on `macos-latest`,
  derive the version from the tag, and run `publishAndReleaseToMavenCentral`
  (or, for the very first release, the manual-review `publishToMavenCentral`)

#### Scenario: PR validation
- **WHEN** a pull request is opened against `iroh-kmp`
- **THEN** `ci.yml` SHALL run `cargo test` and `cargo clippy -D warnings` on
  Linux, without requiring the macOS-only full publication build

### Requirement: iOS link dependencies are declared explicitly
Consumers linking the SDK on iOS SHALL declare the native framework
dependencies the Rust crate's dependencies require, since they are not
autolinked.

#### Scenario: Linking the iOS app
- **WHEN** the `ios-app` target links against the SDK's iOS staticlib
- **THEN** `OTHER_LDFLAGS` SHALL include
  `-framework SystemConfiguration -framework Network`, or the final link SHALL
  fail with undefined `_SC*` symbols

### Requirement: Per-connection RTT is a synchronous QUIC snapshot
`rttMs()` SHALL report the smoothed round-trip time of the connection's
currently selected QUIC path as a non-blocking snapshot, returning null
before any path is established, with no wire-protocol change involved.

#### Scenario: Reading RTT before a path is established
- **WHEN** `rttMs()` is called before the connection has a selected path
- **THEN** it SHALL return `null` rather than blocking or throwing

#### Scenario: Reading RTT on the mock transport
- **WHEN** `rttMs()` is called on the mock transport used in tests
- **THEN** it SHALL return `null`

### Requirement: azula-app consumption wiring
azula-app SHALL depend on the SDK via `mavenLocal` (or Maven Central) in place
of `computer.iroh:iroh`, and SHALL initialize the Android context at app
startup.

#### Scenario: Wiring the Android app
- **WHEN** `android-app` is built against the SDK
- **THEN** `MainActivity` SHALL call `IrohAndroid.installAndroidContext` before
  any endpoint bind is attempted, and `android-app/module.yaml` SHALL declare
  the SDK dependency so its `.so` files land in the APK
