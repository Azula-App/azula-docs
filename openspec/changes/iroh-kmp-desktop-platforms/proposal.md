# Publish iroh-kmp for every desktop platform

## Why

On desktop the SDK only works on Apple Silicon Macs, and only through the JVM:

- **No Kotlin/Native macOS.** A Compose Multiplatform app with a native macOS
  target can't depend on the SDK, because `macosArm64` has no artifact to
  resolve. An outside contributor asked for this in
  [Azula-App/iroh-kmp#2](https://github.com/Azula-App/iroh-kmp/pull/2).
- **JVM on macOS only.** The `-jvm` jar embeds a single native library,
  `darwin-aarch64`, because the publish host is a Mac and builds only its own.
  A JVM desktop app on Linux or Windows resolves the jar and then fails with
  `UnsatisfiedLinkError` the first time it touches the API.

## What Changes

- **A `macosArm64` Kotlin target**, declared behind the same
  `GobleyHost.Platform.MacOS.isCurrent` gate as the iOS targets. It publishes a
  `-macosarm64` klib carrying the release staticlib, the same way the iOS klibs
  do. It ships with two on-device echo tests: loopback with relays off, and
  dialing by ticket through the n0 relays.
- **Dokka documents the shared native binding once.** Gobley's single
  `nativeMain` binding dir is now shared by four native source sets, so
  `macosArm64` joins `iosSimulatorArm64` and `iosX64` in the suppress list.
  Without that, `dokkaGenerate` fails its validity check.
- **The `-jvm` jar carries Linux x64, Linux arm64 and Windows x64 native libs**
  next to `darwin-aarch64`, each at its JNA resource path. A new `jvm-natives`
  job in `publish.yml` builds each `cdylib` on a matching runner
  (`ubuntu-22.04` for the glibc floor, `ubuntu-22.04-arm`, `windows-2025`),
  smoke-loads it and calls one export. The macOS publish job then embeds them
  via `-PjvmPrebuiltNatives`.
- **The publish refuses to ship an incomplete jar.** When prebuilt libs are
  supplied, `embedJvmNativeLib` requires all four platforms, the same way it
  already requires the host's.
- **A dry run of the release.** `publish.yml` gains `workflow_dispatch`. It runs
  the same build into mavenLocal and uploads the `-jvm` jar, with no signing and
  no Central upload. It's run on `main` before each tag.
- **CI runs `cargo test` on each shipped desktop platform** (Linux x64, Linux
  arm64, Windows x64), with clippy still once on Linux x64.

Out of scope: `macosX64` (Intel Macs), and Kotlin/Native `linuxX64`,
`linuxArm64` and `mingwX64`. Those link against Kotlin/Native's own Linux
sysroot and mingw toolchain, and they would have to publish from separate
hosts into one Central deployment.

## Impact

- `iroh-kmp`: `build.gradle.kts`, `.github/workflows/{publish,docs,ci}.yml`,
  `README.md`, new `src/macosArm64Test/`.
- Spec: `iroh-kmp`. The toolchain requirement gains the macOS target. The
  publish requirement now describes a macOS-assembled publication that takes
  its non-macOS JVM natives from their own hosts, plus the dry run. A new
  requirement covers the jvm jar's per-platform natives.
- Consumers: purely additive. Ships in iroh-kmp 0.2.1, alongside the iroh
  1.0.3 → 1.4.1 update.
