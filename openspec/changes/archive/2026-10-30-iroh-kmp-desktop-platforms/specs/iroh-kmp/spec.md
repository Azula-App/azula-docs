## ADDED Requirements

### Requirement: The jvm artifact carries a native library for every desktop platform
The `-jvm` artifact SHALL embed the SDK's native library at its JNA resource path for macOS arm64 (`darwin-aarch64`), Linux x64 (`linux-x86-64`), Linux arm64 (`linux-aarch64`) and Windows x64 (`win32-x86-64`), so a JVM desktop app on any of them loads the SDK with no extra configuration. Each non-macOS library SHALL be built on a host of its own platform, and a release build SHALL fail rather than publish a `-jvm` artifact missing any of the four.

#### Scenario: A JVM desktop app on Linux or Windows
- **WHEN** a JVM app on Linux x64, Linux arm64 or Windows x64 depends on
  `app.azula.iroh:iroh-kmp` and calls into the SDK
- **THEN** JNA SHALL find the platform's library inside the `-jvm` jar, and
  the call SHALL NOT fail with `UnsatisfiedLinkError`

#### Scenario: A platform's library is missing at release time
- **WHEN** the release build runs with `-PjvmPrebuiltNatives` and any of the
  four libraries is absent
- **THEN** `embedJvmNativeLib` SHALL fail the build naming the missing
  libraries, and nothing SHALL be published

#### Scenario: Local builds stay host-only
- **WHEN** `./gradlew publishToMavenLocal` runs without `-PjvmPrebuiltNatives`
- **THEN** the `-jvm` jar SHALL carry only the host's library, and the build
  SHALL still fail if that one is missing

## MODIFIED Requirements

### Requirement: Build and publish toolchain requirements
Building and publishing the SDK SHALL require JDK 17, Android NDK r28+, and a Rust toolchain with the Android, iOS and macOS targets installed. The JDK and the Rust
toolchain SHALL be declared in the repo's `mise.toml` per the `toolchain`
capability, so entering the repo selects them; the Android NDK remains
host-provided.

#### Scenario: Publishing to mavenLocal
- **WHEN** running `./gradlew publishToMavenLocal` from `iroh-kmp/` with the
  repo's declared toolchain active and `ANDROID_HOME` set
- **THEN** the build SHALL succeed without a signing key present, and without
  `JAVA_HOME` being set by hand, publishing the root KMP metadata plus
  per-target artifacts (`-android`, `-jvm`, `-iosarm64`, `-iossimulatorarm64`,
  `-iosx64`, `-macosarm64`) to `~/.m2/repository/app/azula/iroh/`

#### Scenario: Sibling repo requiring a different JDK
- **WHEN** a developer moves between `iroh-kmp/` and `azula-app/`, which
  requires a different JDK
- **THEN** each repo resolves to its own declared JDK with no manual
  environment change between them

### Requirement: Maven Central publish is tag-driven and host-gated
Publishing to Maven Central SHALL run only on a `v*` tag push, and the publication SHALL be assembled on a macOS host since it is the only host capable of building every KMP target (iOS + macOS + Android + JVM) in one publication set; the JVM's Linux and Windows native libraries SHALL be built on their own hosts and handed to it.

#### Scenario: Cutting a release
- **WHEN** `VERSION_NAME` in `gradle.properties` and `version` in `Cargo.toml`
  are bumped, committed, and tag `vX.Y.Z` is pushed
- **THEN** `iroh-kmp/.github/workflows/publish.yml` SHALL build the Linux x64,
  Linux arm64 and Windows x64 JVM native libraries on matching runners, then
  on `macos-latest` derive the version from the tag and run
  `publishAndReleaseToMavenCentral` with those libraries supplied
  (or, for the very first release, the manual-review `publishToMavenCentral`)

#### Scenario: Dry-running a release
- **WHEN** `publish.yml` is dispatched by hand on `main`
- **THEN** it SHALL run the same build, every JVM native library included,
  into mavenLocal with no signing key and no Maven Central upload or GitHub
  Release, and upload the resulting `-jvm` jar as a workflow artifact

#### Scenario: PR validation
- **WHEN** a pull request is opened against `iroh-kmp`
- **THEN** `ci.yml` SHALL run `cargo test` on Linux x64, Linux arm64 and
  Windows x64, and `cargo clippy -D warnings` on Linux x64, without requiring
  the macOS-only full publication build
