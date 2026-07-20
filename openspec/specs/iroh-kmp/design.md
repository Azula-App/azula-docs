# iroh-kmp — the iroh SDK for azula

`iroh-kmp/` (sibling repo, package `app.azula.iroh`) is a full-featured iroh SDK
for Kotlin Multiplatform. It wraps the `iroh` 1.0 crate in a Rust + UniFFI crate
and generates JNI/JNA + Kotlin/Native bindings with [Gobley](https://gobley.dev).
Published to mavenLocal — and, via CI, to **Maven Central** — as
`app.azula.iroh:iroh-kmp` (version from `iroh-kmp/gradle.properties` `VERSION_NAME`,
currently `0.1.0`; azula-app pins it in `android-app/module.yaml` and
`jvm-app/module.yaml`). It replaces `computer.iroh:iroh` on jvm + android and
unblocks real iroh on Android. It began as azula's minimal transport and now
exposes the core iroh API so other consumers can use it standalone.

## Why it exists

`computer.iroh:iroh:1.0.0` is UniFFI-over-JNA and its async calls appeared to
hang on Android (`Endpoint.bind` never returned). Rebuilding the binding with
Gobley + the two fixes below makes async complete on-device.

## What's in the repo

```
iroh-kmp/
  Cargo.toml                         # crate `iroh_kmp`, cdylib+staticlib, uniffi 0.29 + tokio
  .cargo/config.toml                 # IPHONEOS_DEPLOYMENT_TARGET=13.0 (iOS link fix, see below)
  src/commonMain/rust/               # lib.rs, endpoint.rs, stream.rs, error.rs, android_init.rs
  src/androidMain/kotlin/...IrohAndroid.kt   # installAndroidContext (ndk_context init)
  src/androidMain/jniLibs/<abi>/libjnidispatch.so  # bundled into the AAR
  build.gradle.kts                   # KMP + Gobley (cargo+uniffi) + maven-publish
```

### API (generated into `app.azula.iroh`)

The **azula transport surface is unchanged** and maps 1:1 onto
`IrohTransport`/`P2pStream`: `IrohEndpoint.bind(alpns, secretKey?)`, `nodeId()`,
`secretKeyBytes()`, `myTicket()`, `connect(ticket, alpn)`,
`acceptNext(): IncomingConn?`, `shutdown()`, `sign()`;
`IrohStream.sendBytes/recv/finish` and `rttMs(): ULong?`; the ticket/signature free
fns. **Backward compat is a hard contract** — those signatures and behaviors are
preserved byte-for-byte (`connect` is now `connectConn + openBi` and `acceptNext`
is `acceptConn + acceptBi` internally, with identical observable behavior). All the
below is **additive**, so azula-app/shared recompiles unchanged.

The added core-iroh surface:
- **Endpoint config**: `bind_with(EndpointOptions)` — `relayMode`
  (`Default`/`Disabled`/`Custom(urls)`), `addressLookup`, `bindAddr`,
  `externalAddrs`, `warmUpOnline`. `bind` is a thin delegate with every option
  defaulted to today's behavior.
- **Dial**: `connectConn(ticket)`, `connectAddr(NodeAddr)`,
  `connectByNodeId(hex)`; **accept**: `acceptConn(): IrohConnection?` (shares the
  single-consumer accept queue with `acceptNext` — pick one loop).
- **`IrohConnection`**: multiple `openBi/acceptBi/openUni/acceptUni` streams,
  datagrams (`sendDatagram`/`trySendDatagram`/`readDatagram`/`maxDatagramSize`),
  `shutdown(code, reason)`/`closed()`/`closeReason()`, and info
  (`remoteNodeId`/`alpn`/`stableId`/`rttMs`/`paths`/`connType`).
- **Streams**: `IrohStream` extended (`readExact`/`readToEnd`/priority/reset/stop/
  ids) plus uni `IrohSendStream`/`IrohRecvStream`.
- **Status/info**: `nodeAddr()`/`nodeAddrUpdated()`, `directAddresses()`,
  `homeRelay()`, `boundSockets()`, `waitOnline()`, `isClosed()`, `setAlpns()`,
  `networkChange()`, `remoteInfo(hex): RemoteInfo?`. Watchers are snapshot +
  `…Updated()` accessors (UniFFI can't ship a `Watcher` across FFI); loop
  `…Updated()` into a `Flow` like `acceptNext`. Metrics are not yet exposed (TODO).

### Per-connection latency (`rttMs`)

`IrohStream` retains the originating `iroh::endpoint::Connection` (a cheap `Clone`
handle) so it can surface the live QUIC round-trip time: `rtt_ms()` reads the
smoothed RTT of the connection's **selected path** (`conn.paths()` → the path where
`is_selected()` → `path.rtt()`), returning `None` before a path is established. It's
a synchronous, non-blocking snapshot. The app exposes this as `P2pStream.rttMs():
Long?`; `ConnectService` polls it (~2s) into a per-conversation `ConversationState.rttMs`,
which the chat header and each conversation-list row display. No wire-protocol
(`Frame`) change is involved — the RTT comes from QUIC itself, so it works for every
conversation kind (chat, terminal, LLM/MCP bridge). The mock transport returns null.

## The two non-obvious fixes

1. **`ndk_context` init (DNS).** iroh's DNS resolver reads the device DNS servers
   through `ndk_context`, which must be initialized with the JavaVM + app context
   **before** any endpoint binds. The SDK exports a JNI hook; the app calls
   `IrohAndroid.installAndroidContext(applicationContext)` once at the top of
   `MainActivity.onCreate`. Without it, bind/online stall — which is what looked
   like the "async hangs" blocker.
2. **`libjnidispatch.so` (JNA).** Gobley's jvm/android bindings call through JNA.
   The plain `net.java.dev.jna:jna` jar Gobley pulls carries no Android `.so`, so
   the first call throws `UnsatisfiedLinkError`. The SDK bundles the per-ABI
   `libjnidispatch.so` (from the jna aar) into its own AAR via a `jniLibs.srcDir`,
   so consumers need no manual jniLibs.

Also: iOS C deps (blake3/ring) compile against the current SDK and reference
`___chkstk_darwin`, only resolvable at iOS ≥ 13. `.cargo/config.toml` pins
`IPHONEOS_DEPLOYMENT_TARGET=13.0` so the Rust link agrees.

iOS app link: iroh's deps (`netdev`, `system_configuration`) call the
**SystemConfiguration** framework, which the app doesn't autolink. Add
`OTHER_LDFLAGS = "$(inherited) -framework SystemConfiguration -framework Network"`
to the `ios-app` Xcode target (done in `ios-app/module.xcodeproj`), or the final
link fails with `Undefined symbols (_SC*)`.

## Build & publish

Requires Android NDK r28+, Rust + the Android/iOS targets, and **JDK 17** (AGP 8.7).

```bash
cd iroh-kmp
export JAVA_HOME=/Library/Java/JavaVirtualMachines/zulu-17.54.21/Contents/Home
export ANDROID_HOME=$HOME/Library/Android/sdk
./gradlew publishToMavenLocal      # → ~/.m2/repository/app/azula/iroh/
```

Publishes the root KMP metadata + per-target artifacts (`-android` aar with the
.so, `-jvm`, `-iosarm64`, `-iossimulatorarm64`, `-iosx64`). `publishToMavenLocal`
works without GPG — signing is applied only when a signing key is present.

## Notes

- **Cross-host `cargoBuild*` gating (fixed 2026-07-04).**
  `./gradlew publishToMavenLocal` used to pull in
  `cargoBuildLinuxArm64Debug`/`…X64`/`MinGWX64` even though no Linux/Windows
  KMP variant is published, failing the whole publish on a Mac.
  `iroh-kmp/build.gradle.kts` now disables those `cargoBuild*` tasks outside
  their native host (`enabled = GobleyHost.Platform.Linux.isCurrent` /
  `…Windows.isCurrent`, next to the existing iOS host gate), so
  `-x cargoBuildLinux… -x cargoBuildMinGW…` is no longer needed on a publish
  run. Verified at the config/task level (the six tasks report `SKIPPED` with
  no cargo invocation, and `publishToMavenLocal --dry-run` configures
  cleanly).

## Publishing to Maven Central + docs CI

Publishing is wired through the
[vanniktech maven-publish](https://vanniktech.github.io/gradle-maven-publish-plugin/)
plugin (**0.35.0** — 0.37+ needs Kotlin ≥2.2 / AGP ≥8.13, which Gobley 0.3.7
doesn't yet support) → the **Central Portal**, plus Dokka **2.2.0** for API docs.
Three SHA-pinned workflows live in `iroh-kmp/.github/workflows/`:

- **`publish.yml`** — on a `v*` tag. Runs on `macos-latest` (the only host that can
  build every KMP target — iOS + Android + jvm — in one publication set), derives
  the version from the tag (`-PVERSION_NAME`), and runs
  `publishAndReleaseToMavenCentral`.
- **`docs.yml`** — on push to `main` (+ releases). Builds Dokka HTML and uploads
  the `dokka-html` artifact; a `deploy` job to GitHub Pages is wired but gated
  behind `!repository.private` (Pages on a private repo needs Enterprise), so it
  activates automatically when the repo goes public and Pages is enabled
  (Source: GitHub Actions).
- **`ci.yml`** — on PRs: `cargo test` + `cargo clippy -D warnings` on Linux.

**Release runbook:** bump `VERSION_NAME` in `gradle.properties` *and* `version` in
`Cargo.toml`, commit, then `git tag vX.Y.Z && git push origin vX.Y.Z`. For the
first release, temporarily use `publishToMavenCentral` (manual Portal review)
instead of `publishAndReleaseToMavenCentral`.

**One-time prerequisites (out of band; the publish workflow is inert until done):**
verify the `app.azula` namespace on the Central Portal (DNS TXT on `azula.app`),
create a Portal user token, generate + publish a GPG key, then add repo secrets
`MAVEN_CENTRAL_USERNAME`, `MAVEN_CENTRAL_PASSWORD`, `SIGNING_IN_MEMORY_KEY` (full
armored private key), `SIGNING_IN_MEMORY_KEY_PASSWORD` — CI maps them to the
`ORG_GRADLE_PROJECT_*` properties vanniktech reads.

## How azula-app consumes it

- `shared/module.yaml`: `repositories: [mavenLocal]`; `dependencies@jvmAndAndroid:
  app.azula.iroh:iroh-kmp:0.1.0` (replaced `computer.iroh:iroh`).
- `shared/src@jvmAndAndroid/.../IrohFfiTransport.kt`: rewritten against
  `app.azula.iroh.*` (keeps `LineBuffer`, `SecretKeyStore`, pause/resume).
- `android-app/module.yaml`: also depends on the SDK (mavenLocal) so MainActivity
  can call `IrohAndroid` and the .so land in the APK.
- `android-app/src/MainActivity.kt`: calls `IrohAndroid.installAndroidContext`.

## Verified (2026-06)

- JVM desktop: `./kotlin build -m jvm-app` ✓ (regression — desktop moved onto the
  new binding).
- Android (arm64 device): `bind` returns, `nodeId` non-null and stable across
  launches (key persisted), `myTicket()` returns a full relay ticket,
  `demo=false`. APK contains `libiroh_kmp.so` + `libjnidispatch.so` per ABI.
- iOS (iPhone 17 Pro simulator, iOS 26): `bind` returns, `myTicket()` completes,
  `demo=false`, and the node id is **stable across relaunches** (NSUserDefaults
  key persistence in `IrohTransport.ios.kt`). The Rust staticlib links into the
  app via the binding; the Swift `IrohLib` bridge has been **removed**
  (`SwiftTransportBridge.kt` deleted, `iosApp.swift` simplified). Requires a
  simulator whose runtime ≥ the app's min iOS (Xcode 26 SDK ⇒ 26.x).

## Historical: pre-iroh-kmp approaches

Before `iroh-kmp` existed, each platform reached the `iroh` crate a different
way. Both approaches below are superseded; kept here so the history — and the
reasons the SDK looks the way it does — isn't lost.

**Android: the async-dispatch blocker (RESOLVED).** The app originally
depended directly on the `computer.iroh:iroh:1.0.0` Maven artifact, which
ships Kotlin/UniFFI glue plus desktop native libraries but no Android
per-ABI `.so` files. Building and bundling those `.so`s from
`n0-computer/iroh-ffi` turned out to be the easy part — three findings got it
packaged: the correct native lib name is `libiroh_ffi.so` (crate
`iroh_ffi`), Android also needs JNA's own dispatch lib
(`libjnidispatch.so`, matching the artifact's `net.java.dev.jna:jna` version,
here 5.15.0, extracted from the JNA Android AAR), and Amper *does* package
`android-app/jniLibs/<abi>/` via AGP's `mergeJniLibFolders`. The real blocker
was async dispatch: with the libraries bundled and loading correctly,
`Endpoint.bind` still never returned on-device (`nodeId` stayed null, UI
stuck at "connecting…") even though the identical call worked on JVM desktop.
iroh-ffi exposes its API as async UniFFI methods
(`#[uniffi::constructor(async_runtime = "tokio")]`), and UniFFI's async
continuation, dispatched over JNA, does not complete on Android — the
published JNA artifact's async support was effectively JVM-desktop only.
Fixing this needed a binding whose async calls actually work on Android. That
is what `iroh-kmp` provides: a JNI-based Gobley binding rather than
UniFFI-over-JNA, plus the `ndk_context` initialization fix described above
(§"The two non-obvious fixes"). On a real device, `Endpoint.bind` now returns,
`nodeId` is set, and `myTicket()` completes with `demo=false`.

**iOS: the Swift-bridge approach (OBSOLETE, removed).** Kotlin/Native cannot
call the `IrohLib` Swift package directly, so iOS originally implemented the
transport in Swift and injected it into the shared Kotlin code: Kotlin
declared callback interfaces (`SwiftIrohTransport`, `SwiftP2pStream`,
`IrohSwiftRegistry` in `SwiftTransportBridge.kt`), `IosIrohTransport` adapted
those callbacks to the common suspend/Flow `IrohTransport`, and
`ios-app/src/iosApp.swift` implemented them over Apple's `IrohLib` package
(added via Xcode's Add Package Dependencies against
`n0-computer/iroh-ffi`, plus an `-framework Network` linker flag and an
Xcode-16 "Enable Previews: No" workaround), registering an instance into
`IrohSwiftRegistry.shared.impl` before Compose started — falling back to the
demo transport if nothing registered. This whole bridge has been removed:
`SwiftTransportBridge.kt` and `IrohSwiftRegistry` no longer exist,
`iosApp.swift` is simplified, and iOS gets iroh from the same
Kotlin/Native `app.azula.iroh:iroh-kmp` binding as the other platforms — no
Swift package, no Xcode package dependency.
