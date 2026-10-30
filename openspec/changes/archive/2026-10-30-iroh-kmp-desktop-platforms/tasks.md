## 1. Kotlin/Native macOS

- [x] 1.1 Land Azula-App/iroh-kmp#2 (`macosArm64()` target, `kotlin("test")` in
      `commonTest`, `MacosEchoTest`) on `main` with the contributor's commit
      intact — verify GitHub shows the PR as merged
- [x] 1.2 Add `macosArm64` to the Dokka suppress list next to
      `iosSimulatorArm64`/`iosX64` — verify `./gradlew dokkaGenerate` succeeds
- [x] 1.3 Add `aarch64-apple-darwin` to the `rustup target add` step in
      `publish.yml` and `docs.yml`
- [x] 1.4 Run `./gradlew macosArm64Test` — verify both echo tests pass
- [x] 1.5 Run `./gradlew publishToMavenLocal` — verify a `-macosarm64`
      artifact is published next to the existing per-target artifacts

## 2. JVM desktop natives

- [x] 2.1 `embedJvmNativeLib` takes `-PjvmPrebuiltNatives=<dir>` and, when
      given, requires all four `publishedJvmNatives` — verify a dir missing one
      fails the build naming it, and a complete one lands all four in the jar
- [x] 2.2 `publish.yml` `jvm-natives` matrix (`ubuntu-22.04`,
      `ubuntu-22.04-arm`, `windows-2025`) builds the cdylib, smoke-loads it and
      uploads it; the publish job downloads and embeds them
- [x] 2.3 `publish.yml` `workflow_dispatch` dry run into mavenLocal, uploading
      the `-jvm` jar; the Central publish and GitHub Release run on tags only
- [x] 2.4 `ci.yml` runs `cargo test` on Linux x64, Linux arm64 and Windows x64
- [x] 2.5 Dispatch the dry run on `main` — verify every `jvm-natives` leg
      passes its smoke load, record the glibc floor in the README, and verify
      the uploaded `-jvm` jar lists all four libs
- [x] 2.6 Verify the `ci.yml` run on `main` passes on all three platforms

## 3. Release

- [x] 3.1 Bump `VERSION_NAME` and `Cargo.toml` `version` to 0.2.1, then push tag
      `v0.2.1` — verify `publish.yml` succeeds and `iroh-kmp-macosarm64:0.2.1`
      plus a `iroh-kmp-jvm:0.2.1` jar with all four libs resolve from Maven
      Central

## 4. Docs

- [x] 4.1 Update `specs/iroh-kmp/design.md`: build section (rustup targets,
      artifact list, publish host rationale) and how the jvm jar's natives
      are assembled
