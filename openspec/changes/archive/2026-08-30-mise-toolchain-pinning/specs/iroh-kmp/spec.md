## MODIFIED Requirements

### Requirement: Build and publish toolchain requirements
Building and publishing the SDK SHALL require JDK 17, Android NDK r28+, and a
Rust toolchain with the Android and iOS targets installed. The JDK and the Rust
toolchain SHALL be declared in the repo's `mise.toml` per the `toolchain`
capability, so entering the repo selects them; the Android NDK remains
host-provided.

#### Scenario: Publishing to mavenLocal
- **WHEN** running `./gradlew publishToMavenLocal` from `iroh-kmp/` with the
  repo's declared toolchain active and `ANDROID_HOME` set
- **THEN** the build SHALL succeed without a signing key present, and without
  `JAVA_HOME` being set by hand, publishing the root KMP metadata plus
  per-target artifacts (`-android`, `-jvm`, `-iosarm64`, `-iossimulatorarm64`,
  `-iosx64`) to `~/.m2/repository/app/azula/iroh/`

#### Scenario: Sibling repo requiring a different JDK
- **WHEN** a developer moves between `iroh-kmp/` and `azula-app/`, which
  requires a different JDK
- **THEN** each repo resolves to its own declared JDK with no manual
  environment change between them
