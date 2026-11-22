## Why

Sal wants an Android phone to be an `azula compute` host on these terms
(2026-11-22), in priority order:

1. azula is installable from the Play Store and hosts the VM itself.
2. Google's Linux Terminal app is not needed.
3. Ideally no adb or wireless-debugging step at all.

The earlier research rejected an app-hosted VM (option (a) in
[`../compute-local-backend/design-pages/android-pkvm-findings.md`](../compute-local-backend/design-pages/android-pkvm-findings.md))
for distribution reasons. A prototype now shows that each blocker can be
worked around. Sideloaded app `app.azula.avfhost` on a stock Pixel 10a
(Android 17) does all of the following without the Terminal app:
- It boots the stock Debian 13 arm64 cloud image through AVF.
- It runs the azula broker itself.
- It passes `vm/e2e/cloud.sh` relay-only.

Evidence and measurements are in
[`design-pages/android-app-host-findings.md`](design-pages/android-app-host-findings.md).

Point 3 can't be met today. No grant-free route to AVF exists for a
third-party app, so each user grants two permissions once. Sal chose an
in-app wireless-debugging pairing for that, with no computer
(2026-11-22).

## What Changes

- **An "azula host" in `app.azula`'s base APK.** Sal first chose an
  on-demand dynamic feature, then revised to the base APK on 2026-11-22,
  because Kotlin Toolchain can't build dynamic features; see design D6. It
  hosts one Linux VM through `android.system.virtualmachine`, which it
  reaches with an in-process hidden-API exemption. It runs in its own
  `:vmhost` process under a `specialUse` foreground service.
- **The same guest as on the Mac.** It's the stock Debian 13 arm64 cloud
  image, EFI-booted by the APEX's own `u-boot.bin`, plus a cloud-init
  NoCloud seed. The seed installs `azula-guest` (vsock 1024), an HTTP proxy
  shim, and clock sync over the proxy.
- **The same broker code.** It's azula-cli's `compute` broker in attach
  mode, linked as a JNI library (`libazula_host.so`) that runs in
  `:vmhost`. It's the same code as `compute serve --local --worker-socket
  <app socket>`, which the sideloaded prototype runs as a child process.
  The app bridges that socket to
  `VirtualMachine.connectVsock(1024)`, so the client side is identical to a
  Mac host.
- **Guest internet without a NIC.** The app runs an HTTP CONNECT and
  absolute-form proxy, reached over vsock connections the app pre-opens to
  the guest's shim on port 3129. `azula-guest --job-env-file` gives every
  job `HTTP(S)_PROXY`.
- **A one-time permission grant on the phone.** The app embeds an adb
  client, as Shizuku and LADB do. It pairs over Wireless debugging with a
  code the user enters in an azula notification, then runs `pm grant` for
  `MANAGE_VIRTUAL_MACHINE` and `USE_CUSTOM_VIRTUAL_MACHINE`. The grants
  survive reboots and app updates (verified).
- **azula-cli changes.**
  - Attach mode for `serve --local`.
  - `azula-guest --job-env-file`.
  - `vm/avf-seed`, the seed sources.
  - A static `aarch64-unknown-linux-musl` broker build for the feature.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `remote-compute`: adds the Android app host. It covers hosting, guest
  isolation, guest networking and time, the one-time grant, and the
  lifecycle.

## Impact

- **`azula-app`:**
  - The host code, `libazula_host.so` (about 10–13 MB more download on
    arm64) and the seed ISO go into the base APK.
  - The manifest gains the two VM permissions and the `specialUse`
    foreground service in `:vmhost`.
  - Kotlin Toolchain can't build Play dynamic features (KTC-5242), so the
    feature isn't on-demand.
- **`azula-cli`:**
  - The `compute-avf-host` prototype branch lands: attach mode, `--job-env-file`, `vm/avf-seed`, and `vm/android-host` as the reference prototype.
  - The release builds the static musl broker.
- **Play Console:**
  - target API 36 or later;
  - a `specialUse` foreground-service justification;
  - hidden-API use appears as pre-launch-report warnings.
- **Users:**
  - a phone with AVF and non-protected VMs (Pixel 6 or later on Android
    16+, and others);
  - Wi-Fi for the one-time pairing;
  - about 0.4 GB download and up to 16 GB of disk;
  - a charger for sustained use.
- **Relationship to `compute-local-backend`:**
  - That change stays as the grant-free fallback, for users who already
    run the Terminal app.
  - Its `serve --local` work is shared: attach mode is a mode of that
    backend.
