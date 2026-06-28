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
coordinate, e.g. `dev.azula:iroh-android:1.0.0`, into `~/.m2`. Then in
`shared/module.yaml` add the repository and an Android-only dependency:

```yaml
repositories:
  - mavenLocal

dependencies@android:
  - dev.azula:iroh-android:1.0.0
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
