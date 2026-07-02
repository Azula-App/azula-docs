# iroh-kmp — the iroh SDK for azula

`iroh-kmp/` (sibling repo, package `app.azula.iroh`) is a minimal iroh SDK for
Kotlin Multiplatform. It wraps iroh in a small Rust + UniFFI crate and generates
JNI/JNA + Kotlin/Native bindings with [Gobley](https://gobley.dev), published to
mavenLocal as `app.azula.iroh:iroh-kmp:0.1.0`. It replaces `computer.iroh:iroh`
on jvm + android and unblocks real iroh on Android.

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

API (generated into `app.azula.iroh`): `IrohEndpoint.bind(alpns, secretKey?)`,
`nodeId()`, `secretKeyBytes()`, `myTicket()`, `connect(ticket, alpn)`,
`acceptNext(): IncomingConn?`, `shutdown()`; `IrohStream.sendBytes/recv/finish`
and `rttMs(): ULong?`. This maps 1:1 onto the app's `IrohTransport`/`P2pStream`.

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
.so, `-jvm`, `-iosarm64`, `-iossimulatorarm64`, `-iosx64`).

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
