# Android: building the iroh native library

The `computer.iroh:iroh:1.0.0` Maven artifact ships the Kotlin/UniFFI glue plus
desktop native libraries, but **not** the Android per-ABI `.so` files. You build
those from [`n0-computer/iroh-ffi`](https://github.com/n0-computer/iroh-ffi) with
the Android NDK, then make them available to the `android-app` module.

Amper has **no local-file/aar dependency mechanism**, so there are two supported
paths. The recommended one publishes a coordinate to your local Maven.

## 1. Build the Android `.so` from iroh-ffi

```bash
git clone https://github.com/n0-computer/iroh-ffi
cd iroh-ffi
rustup target add aarch64-linux-android armv7-linux-androideabi x86_64-linux-android
cargo install cargo-make
# Point cargo at the NDK toolchains via .cargo/config.toml (see iroh-ffi README.kotlin.md),
# then generate the Kotlin sources + per-ABI native libraries:
cargo make bindgen-kotlin
```

This produces Kotlin sources under `kotlin/lib/src/main/kotlin/` and native
libraries under `kotlin/lib/src/main/resources/` (one per ABI:
`arm64-v8a`, `armeabi-v7a`, `x86_64`).

## 2a. Recommended — publish to mavenLocal

Publish the locally built Android binding (Kotlin + bundled `.so`) under a
coordinate, e.g. `app.azula:iroh-android:1.0.0`, into `~/.m2`. Then in
`shared/module.yaml` add the repository and an Android-only dependency:

```yaml
repositories:
  - mavenLocal

dependencies@android:
  - app.azula:iroh-android:1.0.0
```

and drop the `computer.iroh:iroh:1.0.0` entry from `dependencies@jvmAndAndroid`
into a `dependencies@jvm`-only block (the desktop artifact stays for JVM).

## 2b. Quick path — bundle the `.so` as jniLibs

Copy the built libraries into the `android-app` module so Amper packages them:

```
android-app/
  jniLibs/
    arm64-v8a/libuniffi_iroh.so
    armeabi-v7a/libuniffi_iroh.so
    x86_64/libuniffi_iroh.so
```

The binding loads the library by name via `System.loadLibrary`; make sure the
filename matches what the generated `iroh_ffi.kt` expects.

## 3. Lifecycle

`MainActivity` already wires `ProcessLifecycleOwner` to `IrohConfig.activeTransport`
so the endpoint shuts down on background and re-binds on foreground, and uses
`AndroidSecretKeyStore` (EncryptedSharedPreferences) to keep a stable node id.
To stay connected while backgrounded, run iroh inside a foreground `Service`
with the appropriate `FOREGROUND_SERVICE_*` permissions.

## Build

```bash
./kotlin build -m android-app -p android
```

## Verified findings (2026-06) and the real blocker

Actually building + bundling the native lib, end to end:

1. **Lib name is `libiroh_ffi.so`** (crate `iroh_ffi`), *not* `libuniffi_iroh.so`.
   The `computer.iroh:iroh:1.0.0` artifact is **UniFFI-over-JNA**, so Android also
   needs JNA's own dispatch lib, **`libjnidispatch.so`**, matching the artifact's
   `net.java.dev.jna:jna` version (1.0.0 → **jna 5.15.0**). Extract it from the
   JNA Android AAR: `jna-5.15.0.aar` → `jni/arm64-v8a/libjnidispatch.so`.
2. **Cross-compile that works** (NDK r28, phone = arm64-v8a):
   ```bash
   NDK=$ANDROID_HOME/ndk/28.0.13004108
   BIN=$NDK/toolchains/llvm/prebuilt/darwin-x86_64/bin
   export CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER=$BIN/aarch64-linux-android24-clang
   export CC_aarch64_linux_android=$BIN/aarch64-linux-android24-clang
   export AR_aarch64_linux_android=$BIN/llvm-ar
   cargo build --release --target aarch64-linux-android -p iroh-ffi --lib   # iroh-ffi @ v1.0.0
   ```
   iroh + quinn + crypto cross-compile cleanly (no aws-lc/ring issues).
3. **Amper DOES package `android-app/jniLibs/<abi>/`** (AGP `mergeJniLibFolders`
   lists it as a source). Drop `libiroh_ffi.so` + `libjnidispatch.so` in
   `android-app/jniLibs/arm64-v8a/`; both land in the APK's `lib/arm64-v8a/`.

**The remaining blocker is not packaging — it's async dispatch.** With the libs
bundled, the app loads the real transport on-device (`libjnidispatch.so` loads OK;
no demo fallback), but **`Endpoint.bind` never returns**: `nodeId` stays null and
the UI sticks at "connecting…". iroh-ffi exposes its whole API as **async UniFFI
methods** (`#[uniffi::constructor(async_runtime = "tokio")] pub async fn bind`),
and **UniFFI's async continuation, dispatched over JNA, does not complete on
Android** (it works on JVM desktop). `builder.bind().await` is local-only (binds
sockets, spawns actors — no relay/network), so the stall is the foreign-future
callback never firing, not connectivity.

**To finish real iroh on Android** you need a binding whose async calls work on
Android — i.e. **JNI-based UniFFI bindings** (UniFFI can target JNI instead of
JNA), or a hand-written async dispatcher. The published JNA artifact's async
support is effectively JVM-desktop only.
