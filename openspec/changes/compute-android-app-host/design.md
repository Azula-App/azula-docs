## Context

[`design-pages/android-app-host-findings.md`](design-pages/android-app-host-findings.md)
has the full evidence; this is a summary.

On a stock Pixel 10a (Android 17, CP3A.261005.005), the sideloaded
prototype `app.azula.avfhost` boots the Debian VM without the Terminal app.
It needs two things: a one-time `pm grant` of `MANAGE_VIRTUAL_MACHINE` and
`USE_CUSTOM_VIRTUAL_MACHINE`, and an in-process hidden-API exemption. The
azula broker reaches the VM over vsock, and
`vm/e2e/cloud.sh` passes relay-only.

Relevant platform facts:
- **SELinux.** Policy gives every third-party app its own AVF domains:
  `untrusted_app_all` transitions to `untrusted_app_all_virtualizationmanager`
  when it execs `virtmgr`, then to `untrusted_app_all_virtmgr_crosvm`. The app
  may read and write vsock fds that virtmgr hands it, but can't create
  vsock sockets itself.
- **Networking.** VM networking (`IVmTethering`) is reserved to the Terminal
  app's `vmlauncher_app` domain, so app-hosted VMs have no NIC.
- **Process lifetime.** `virtmgr` and `crosvm` are the app process's phantom
  processes. They die with it.

## Goals / Non-Goals

**Goals:**
- A Play-installable azula that hosts one VM through AVF, with no Terminal
  app.
- Unchanged clients, tokens and protocol.
- A setup that needs no computer.

**Non-Goals:**
- Making setup grant-free. That isn't possible today; see D7.
- Several VMs per phone, and protected VMs.
- GPU access, and inbound ports into the guest.
- Starting hosting automatically after a reboot. This is a later
  option, with Android 15+ limits on starting a foreground service at boot
  to check.

## Decisions

### D1. The AVF Java API with an in-process hidden-API exemption, not a native client

The host calls these classes from
`android.system.virtualmachine`:
- `VirtualMachineManager.getOrCreate`;
- `VirtualMachineConfig.Builder.setCustomImageConfig`;
- `VirtualMachineCustomImageConfig.Builder` (`setBootloaderPath`,
  `addDisk(Disk.RWDisk/RODisk)`, `useNetwork(false)`);
- `VirtualMachine.run`, `stop` and `connectVsock`.

It reaches them after calling LSPosed's `HiddenApiBypass.addHiddenApiExemptions("L")`
(hiddenapibypass 6.2). The call is verified on Android 17, and its effect
is scoped to the calling process. Compile-only stubs mirror the API dumped
from the device. Alternatives considered:
- **A native client.** It would exec `virtmgr` and speak RPC binder
  itself. SELinux allows that. But every AIDL module in the APEX is
  `unstable: true`, and the APEX updates through Play system updates, so
  the interface can change under the app without an OS update. We would
  also have to ship libbinder's RPC client.
- **The `vm` CLI.** It's a native client too, but it has no vsock
  subcommand. The app domain can't create `AF_VSOCK`, so the app couldn't
  reach the guest.
- **A device-wide `hidden_api_blacklist_exemptions` setting.** It changes
  global settings, and a Play app can't set it.

### D2. The same guest as the Mac

The guest is Debian 13 `generic` arm64 (`debian-13-generic-arm64.tar.xz`
from cloud.debian.org, checked against `SHA512SUMS`), EFI-booted by
`/apex/com.android.virt/etc/u-boot.bin` (verified). The disk is grown
sparse to 16 GiB, and cloud-init's growpart expands the root filesystem.

A read-only NoCloud seed ISO (`vm/avf-seed`) ships prebuilt as a feature
asset. It installs:
- `azula-guest` (vsock 1024, `--job-env-file /etc/azula/job-env`);
- `azula-vsock-proxy`;
- `azula-timesync` and its timer.

The seed also sets the apt and git proxy, switches the apt sources to
https, masks `systemd-networkd-wait-online` (with no NIC it stalls every
boot for 2 minutes), and installs `build-essential git file`.

### D3. The broker is a JNI library running in `:vmhost`, in attach mode

Revised 2026-11-22. The prototype ran the static musl `azula` as a child
process (`compute serve --local --worker-socket …`). That needs the native
library extracted to disk so it can be exec'd. Kotlin Toolchain packages
native libs uncompressed and unextracted, and ignores `extractNativeLibs`
(task 1.1), so exec would need the release to patch one byte of the AAB's
`BundleConfig.pb`.

So the shipped host links the broker into an `aarch64-linux-android`
`cdylib` with a small JNI surface. It's `libazula_host.so`, built with the
NDK, from a new azula-cli crate that reuses the `compute` broker code.
- `start(configJson)` runs the attach-mode broker on its own tokio runtime
  in the `:vmhost` process.
- `stop()`, `mintGrant(ttl, label) → token`, `listGrants()` and
  `revoke(id)` cover the rest.

Benefits:
- It needs no exec and no AAB patch.
- There's one fewer phantom process.
- It uses the same code as `azula compute serve --local --worker-socket`
  (attach mode: waits up to 180 s for the worker, refuses `vm stop`, never
  looks up users).

Platform fallbacks still apply: iroh's built-in DNS and embedded TLS roots;
netlink is denied, a harmless warning. The CLI child-process form stays for
the sideloaded prototype (`vm/android-host`).

### D4. Guest internet through an HTTP proxy over pooled vsock

The guest can't connect to the app (no NIC, and the app can't listen on
vsock), so the direction is inverted:
1. The app keeps 4 idle `connectVsock(3129)` connections open to the
   guest's shim.
2. The shim hands one to each local client on 127.0.0.1:3128.
3. The app's end speaks HTTP proxy: `CONNECT`, plus absolute-form `http`.

DNS resolves on the host side. Measured at 7.7–8.1 MB/s. That covers apt,
git, cargo, pip, npm and curl.

**Later option:** a full userspace network stack over vsock (gvisor-tap-vsock
or passt-style), for UDP, raw TCP and inbound ports.

### D5. Clock sync over the proxy

u-boot exposes the pl031 RTC with no device, so the guest boots at
systemd's epoch (April 2026 here), and TLS would reject current
certificates. `azula-timesync` sets the clock from the HTTP `Date` header
of `http://deb.debian.org/`, through the proxy, at boot and every 5
minutes. The periodic run also recovers after the phone suspends the VM.

### D6. Shipping in `app.azula`'s base APK, in its own `:vmhost` process

Sal first chose an on-demand Play dynamic feature (2026-11-22). Task 1.1
then showed that Kotlin Toolchain (Amper) can't build one, in 0.11.0 or
the latest 0.14.1:
- `android/app` is its only Android product type
  ([product types](https://kotlin-toolchain.org/latest/user-guide/product-types/overview/)).
- The generated Gradle project can't be customized.
- Feature request [KTC-5242](https://youtrack.jetbrains.com/issue/KTC-5242)
  is open with no fix version.

**Sal's revised decision (2026-11-22): the host goes in `app.azula`'s base
APK, with the broker as a JNI library (D3).**

The alternatives he weighed:
- the same with an exec'd broker plus an AAB patch;
- a separate Play app;
- a Gradle-built Android shell, about 1–2 weeks of work;
- waiting on KTC-5242.

What this means:
- **Base APK contents:** the host's Kotlin code, `libazula_host.so` (about
  10–13 MB compressed on arm64, estimated from the 13.2 MB release tarball)
  and the seed ISO asset.
- **The manifest** declares `MANAGE_VIRTUAL_MACHINE`,
  `USE_CUSTOM_VIRTUAL_MACHINE`, `FOREGROUND_SERVICE_SPECIAL_USE` and the
  `specialUse` service with `android:process=":vmhost"`. Ungranted
  permissions are harmless for people who never host.
- **The `:vmhost` process** holds the hidden-API exemption, the broker and
  the VM's phantom processes. A UI crash doesn't take the VM down. A
  `:vmhost` service in an Amper `android/app` was verified on the Pixel
  (task 1.1).
- **Later:** if KTC-5242 ships, the host can move to an on-demand feature
  to drop the download cost for non-hosts.

### D7. A one-time grant through in-app wireless-debugging pairing

This was Sal's decision on 2026-11-22. **No grant-free route exists:**
- `preinstalled` covers only apps on the system image.
- No role, intent, Play-services API or Terminal delegation exists.
- Nothing in AOSP `main` makes AVF public. Its aconfig flags only promote
  APIs to `@SystemApi` or touch the Terminal.

So the feature embeds an adb client (wireless-debugging pairing: pairing
code, SPAKE2 and TLS, then an `adb shell` service on localhost) and runs
`pm grant app.azula …` for both permissions once. The user flow:
1. Turn on Developer options (tap Build number seven times).
2. Turn on Wireless debugging and tap "Pair device with pairing code".
3. Enter the code into azula's notification, then tap Grant.

Shizuku (Apache-2.0) and LADB are prior art, both on Play. Verified on the
Pixel: the grants survive reboots and `install -r`.

**Unverified:** whether turning Developer options back off revokes the
grants. Check that before telling users they can turn it off.

### D8. Play

- **Target API:** 36 or later, required for new apps and updates from
  2026-08-31.
- **Foreground service:** `specialUse` with
  `PROPERTY_SPECIAL_USE_FGS_SUBTYPE`. Proposed justification: "Hosts a
  user-started Linux virtual machine that runs commands sent by the user's
  own remote coding sessions; runs only while the user keeps hosting on,
  with a persistent notification and a Stop action." It is reviewed in
  Play Console.
- **Hidden-API use:** no Play policy prohibits it. The platform doc only
  promises pre-launch-report warnings.
- **The downloaded Debian image** falls under the Device and Network Abuse
  exception for "code that runs in a virtual machine". Running code from
  a downloaded VM image is otherwise not allowed.
- **No battery-optimization exemption request.** A foreground service plus
  a partial wake lock kept the VM working through forced deep Doze.

## Risks / Trade-offs

- **[The hidden-API exemption breaks in a future Android or ART release.]**
  A community report says AVF members are BLOCKED on Android 17, but the
  bypass works there.
  - Feature-detect at start, then fall back to meta-reflection.
  - The Terminal path (`compute-local-backend`) stays as the grant-free
    fallback.
  - Ask Google for a public API.
- **[`@hide` custom-image APIs change with APEX updates.]** Resolve them
  reflectively behind version checks. A broken API disables hosting with a
  clear message, never a crash loop.
- **[Play review of `specialUse`.]**
  - Prepare the justification and a demo video.
  - If it's rejected, consider `dataSync` limits or a separate app.
- **[Memory and LMK.]** The VM uses 4 GiB on an 8 GiB phone. At about 70%
  of RAM, the Terminal path showed lmkd killing the foreground app.
  - Default to about 50% of RAM.
  - Bound job memory.
- **[Thermals and battery.]** All-core builds throttle about 20% on a
  second run. Recommend a charger.
- **[The VM dies with the host process]** (phantom processes). Run it in
  `:vmhost`, and report `interrupted` jobs at the next start.
- **[Wireless debugging needs Wi-Fi]** for the one-time pairing. Document
  it, with computer adb as the alternative.

## Migration Plan

1. Land azula-cli's prototype branch work: attach mode, `--job-env-file`,
   `vm/avf-seed`, and the musl broker build in release.
2. Build the host into azula-app's base APK, with the JNI broker (D3, D6).
3. Ship it behind a settings entry that's hidden until the feature works
   on Pixel 6, 8 and 10a.
4. Then submit to Play.

Rollback: hide the entry. The base APK carries only manifest declarations.

## Open Questions

- Does turning Developer options off revoke `development`-flag grants?
  (See D7.)
- Should the host restart automatically after a reboot, given the Android
  15+ boot-FGS restrictions?
