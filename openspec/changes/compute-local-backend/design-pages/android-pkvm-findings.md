# Android phones as `azula compute` hosts: findings

Research for the question of whether an Android phone, especially a Pixel
with pKVM, can play the Mac's role in `azula compute`, so a Claude Code or
Codex cloud session can borrow its CPU and RAM. Done 2026-11-21. Prior art
comes from web sources, linked inline. Everything marked **measured** or
**verified** was done on Sal's Pixel 10a over adb. The recommendation and
spec delta live in this change's `proposal.md`, `design.md` and `specs/`.

## Verdict

- **Viable today, without root or Google's help:** run azula inside
  Android's built-in Linux Terminal VM.
  - The Terminal's Debian 13 VM is a real pKVM-isolated Linux machine with
    NAT internet.
  - The released `azula-guest` runs there unmodified.
  - A prototype `azula compute serve --local` (branch
    `compute-local-backend`) served `exec`, `push` and `pull` from the
    Pixel to a client on the Mac over the n0 relays.
  - That needs one broker change: a local backend, specced in this change.
- **Not viable today:** the azula Android app hosting VMs itself through
  AVF.
  - It needs adb-granted development permissions and a hidden-API
    exemption.
  - Its VMs would get no network.
  - A shell-uid helper (adb, or Shizuku-style wireless debugging) can boot
    VMs, but has no vsock and no NIC to reach them.
- **Performance, Pixel 10a (Tensor G4) vs M3 Pro:**
  - About 3.2× slower on a full `azula-cli` release build: 3:47 vs 1:10.
  - About 1.8–1.9× slower on light compiles.
  - Throttles about 20% on a second back-to-back build.
  - The Terminal's maximum memory setting (about 70% of RAM) let Android's
    low-memory killer kill the Terminal, and with it the VM, under build
    load. Size the VM at about 50% of RAM.

## Device under test

| | |
|---|---|
| Phone | Pixel 10a (`stallion`), stock, bootloader locked, verified boot `green` |
| OS | Android 17, build `CP3A.261005.005`, SDK 37, `user` build |
| SoC | Tensor G4: 1× Cortex-X4, 3× A720, 4× A520; 7.4 GiB RAM; 109 GB `/data` |
| Hypervisor | `ro.boot.hypervisor.version=kvm.arm-protected`; `vm.supported=1`, `protected_vm.supported=1` |
| AVF | `vm info`: protected and non-protected VMs supported; no VFIO; OS list `["microdroid"]` |
| Mac reference | MacBook Pro M3 Pro (6P+6E), 36 GiB, macOS 27.2.1 |

## Q1. Can a third-party app create VMs on a Pixel today?

**No, not for a normal install.** Verified on the device unless a link is
given.

1. **`@SystemApi` on the bootclasspath.** `android.system.virtualmachine`
   (`VirtualMachineManager` and the rest) is `@SystemApi`, added in API 34
   ([AOSP README](https://android.googlesource.com/platform/packages/modules/Virtualization/+/refs/heads/android17-release/libs/framework-virtualization/README.md)).
   `/apex/com.android.virt/javalib/framework-virtualization.jar` is on
   `BOOTCLASSPATH` (verified), so hidden-API enforcement blocks it for
   apps that aren't platform-signed or preinstalled. There is no public
   developer.android.com reference and no `@FlaggedApi` promotion through
   Android 17.
2. **Permission protection levels, from `dumpsys package permission`:**
   - `MANAGE_VIRTUAL_MACHINE`: `signature|development|preinstalled`
   - `USE_CUSTOM_VIRTUAL_MACHINE`: `signature|development`

   The `development` flag means `adb shell pm grant <pkg> …` works. That is
   what AOSP's
   [Try AVF](https://source.android.com/docs/core/virtualization/tryavf)
   page and the GrapheneOS-based
   [koiTerminal](https://github.com/outlawsanzhang/koiTerminal) do, plus a
   hidden-API exemption (`settings put global
   hidden_api_blacklist_exemptions …`). Both are developer-only, device-wide
   setup. Google Play's non-SDK-interface policy rules out shipping that.
3. **Networking is reserved to the Terminal app.**
   - The Terminal runs in its own SELinux domain, `vmlauncher_app`. Its VM's
     NIC comes from the `android.system.vmtethering.IVmTethering` service.
   - For every other caller, `vm check-feature-enabled network` says
     "Feature network is disabled".
   - A VM booted with `--network-supported` from `adb shell` came up with
     only `lo`.
   - So even an adb-granted third-party app would host VMs whose only link
     is vsock to that app: no `apt`, no `git clone`, no `cargo fetch`.
4. **Android 15–17 changes.** In Android 15, `MANAGE_VIRTUAL_MACHINE`
   opened to all preinstalled apps (same README). The Terminal app shipped
   for Pixels in the March 2025 update
   ([Android Authority](https://www.androidauthority.com/android-linux-terminal-app-available-3532999)).
   Pixel 10 got gfxstream GPU acceleration in Android 16 QPR2
   ([Android Authority](https://androidauthority.com/pixel-10-linux-apps-gpu-acceleration-3608754/)).
   None of this opened VM creation to third-party apps.
5. **Device support.**
   - pKVM is on Pixel 6 and later (Tensor), and the Terminal runs there.
   - Qualcomm's Gunyah historically ran only protected VMs, which blocked
     the Terminal
     ([Android Authority](https://www.androidauthority.com/snapdragon-chips-android-linux-terminal-3608648)).
     The first Snapdragon phone with Terminal support was reported on
     2026-11-04
     ([9to5Google](https://9to5google.com/2026/11/04/the-first-snapdragon-phone-with-android-linux-terminal-support-is-here/)).
   - Most MediaTek devices don't expose KVM
     ([lyc8503](https://blog.lyc8503.net/en/post/android-kvm-on-mediatek/)).
6. **Protected vs non-protected VMs.** A protected VM's memory is
   inaccessible to Android, but it boots only signed payloads (Microdroid,
   or pvmfw-verified images). The Terminal and every custom Linux guest are
   non-protected: Android, as host, can read their memory. That's fine for
   the phone owner's own jobs. It does mean the VM isn't a secret store
   against the phone's own OS.
7. **Microdroid vs a full Linux guest.**
   - Microdroid is a minimal Android that runs an APK's native payload. It
     doesn't fit `azula-guest`'s POSIX job model.
   - A custom VM (`vm run` config with `kernel`/`initrd`/`params`, or a
     disk with the `u-boot.bin` bootloader in the APEX) runs any arm64
     Linux.
   - vCPUs are host threads. `--cpu-topology match_host` exposes all 8
     cores.
   - Memory is limited only by the caller. The Terminal's slider tops out
     at 5.2 GB on this 7.4 GiB phone.

## Q2. Prior art

### Android's Linux Terminal (`com.android.virtualization.terminal`)

What's on the device. The APK is at
`/apex/com.android.virt/priv-app/VmTerminalAppGoogle@CP3A.261005.005/`. I
dumped its manifest, cloud-init seed and guest root files.

- **How it's enabled.** Developer options → Linux development environment.
  The first launch downloads a Debian image. It runs as non-protected VM
  `debian` (cid 2048) under a `specialUse` foreground service, `VmService`.
  `stopWithTask` isn't set.
- **The guest.**
  - Debian 13 on kernel `6.12.93-android16`; user `droid` (uid 1000,
    passwordless sudo); systemd; a 103 GB sparse root disk.
  - zram swap sized at a quarter of RAM.
  - cloud-init purges `openssh-server` on first boot.
  - The guest agent `linux_vm_manager` does:
    - **port forwarding.** It watches TCP listen states with `tcpstates`.
      The host bridges each forwarded port on `127.0.0.1` after the user
      allows it.
    - **SFTP** over vsock, with a token.
    - **URL forwarding** to the Android browser.
  - The terminal UI is `ttyd` on a Unix socket, bridged to vsock port 7681
    by `socat`, and rendered in a WebView.
- **Shared storage.** The `android` virtiofs share is the phone's **entire
  shared storage** (`/sdcard`), mounted at `/mnt/shared`, owned by
  `droid:users` with mode 0770. A job user outside group `users` can't
  open it (verified).
- **Settings.** Memory size runs from 1.0 to 5.2 GB and needs a VM
  restart. Keep awake offers Off, 1/5/10/30 minutes, 1/2/6 hours and 1 day
  on this build, with a battery warning, and holds a WakeLock. `classes.dex`
  also has an "Indefinite" string that this build doesn't show.
  Closing the Terminal prompts "Closing the terminal will stop all Linux
  background processes", so the host lives only as long as the Terminal
  app.
  Disk resize, port control and display resolution are also there.
- **Custom images.** The Terminal auto-installs a custom image placed in
  `/sdcard/linux`. If a custom config is present, it skips its own memory,
  disk and UI defaults (strings in `classes.dex`).
- **No API for other apps.** The only entry points are the launcher
  intent and a `GuestDocumentsProvider`. There is no autostart:
  `RECEIVE_BOOT_COMPLETED` belongs to WorkManager.
- **Community guidance.** See the
  [claude-code-android AVF guide](https://cdn.jsdelivr.net/gh/ferrumclaudepilgrim/claude-code-android@main/docs/avf-guide.md)
  and [MakeUseOf](https://www.makeuseof.com/i-turned-my-android-phone-into-a-real-linux-machine-with-debian/).
  It reports that the VM dies on screen-off unless Keep awake is set, and
  that an unclean shutdown can force a reinstall. **Neither reproduced
  here:**
  - With Keep awake **Off**, adb attached and the phone not charging, the
    VM kept running a 5-second heartbeat through 2.5 minutes of screen-off
    and 2 minutes of forced deep Doze
    (`dumpsys deviceidle force-idle deep`).
  - The relay and `deb.debian.org` stayed reachable during Doze, since a
    foreground service is exempt from Doze's network restrictions.
  - After the LMK kill below, the VM restarted cleanly.
  - An overnight unplugged soak is still to do (tasks 4.3).

### The `vm` tool (`/apex/com.android.virt/bin/vm`)

Subcommands: `run`, `run-app`, `run-microdroid`, `list`, `info`,
`check-feature-enabled`, `create-partition`, `create-idsig`, `console`,
`start-adbd`, `stop-adbd`.

**Verified on this production `user` build: the `shell` uid holds
`MANAGE_VIRTUAL_MACHINE`, `USE_CUSTOM_VIRTUAL_MACHINE` and
`DEBUG_VIRTUAL_MACHINE`.** `vm run` booted a custom VM from `adb shell`
without root. I used the APEX's own `microdroid_kernel` (GKI 6.6) and my
own initramfs (static busybox + `azula-guest`), with
`--cpu-topology match_host` and 1 GiB. The kernel reached `/init` in
0.42 s of guest time, with all 8 vCPUs, and `azula-guest` was listening on
vsock 1024.

The VM ran as `shell_virtmgr_crosvm`, but nothing could reach it:

- The `shell` domain can't create `AF_VSOCK` sockets (`EACCES`), so it
  can't reach the worker.
- `--network-supported` yields no NIC.
- Console input from a file fails: crosvm reports `WaitContext: EPERM`.

So a shell-uid helper (adb, or Shizuku-style self-adb over wireless
debugging) can boot VMs but can't talk to them. AOSP's
[custom_vm.md](https://android.googlesource.com/platform/packages/modules/Virtualization/+/03569fbd8248b40144a7f124fedca36a32527de2/docs/custom_vm.md)
assumes `adb root`.

### Community pKVM work

- Pixel 6 on Android 13 DP1 exposed KVM, and people booted Linux and
  Windows 11 guests in crosvm
  ([XDA](https://www.xda-developers.com/android-13-dp1-google-pixel-6-kvm-virtual-machine/),
  [Esper](https://www.esper.io/blog/android-dessert-bites-13-virtualization-on-pixel-6-379185)).
  Later builds locked it behind AVF.
- [koiTerminal](https://github.com/outlawsanzhang/koiTerminal) boots NixOS,
  Debian and Alpine through the AVF Java API without root. It uses adb
  `pm grant` and a hidden-API exemption, and lacks port forwarding and
  file transfer.
- [nixos-avf](https://github.com/nix-community/nixos-avf) builds a NixOS
  image for the Terminal.
- A Pixel 9a home server ran QEMU under Termux, with 6 vCPUs, 5.5 GB and
  Docker ([jiyuulife](https://www.jiyuulife.net/battery-backed-home-server-pixel-9a/)).

### Termux / proot (no VM)

It works on any Android, and the static `azula-guest` would run as the
Termux uid. But:

- there is no isolation between jobs and the Termux app's data, or shared
  storage once the storage permission is granted;
- Android 12+'s phantom-process killer caps child processes at 32. It can
  be disabled with `settings put global settings_enable_monitor_phantom_procs
  false`, or "Disable child process restrictions" on 14+, which reverts when
  Developer options is turned off
  ([agnostic-apollo](https://github.com/agnostic-apollo/Android-Docs/blob/master/en/docs/apps/processes/phantom-cached-and-empty-processes.md));
- it needs `termux-wake-lock` and an unrestricted battery setting;
- proot adds syscall overhead and offers no real root.

The Terminal VM's own `crosvm` is also tracked as a phantom process of the
Terminal app. It died with the app (below).

## Q3. Architectures compared

| | (a) azula-app hosts VMs via AVF | (b) azula inside the Terminal VM | (c) shell-uid helper via adb or `vm` | (d) Termux, no VM |
|---|---|---|---|---|
| Works on a stock phone | No: adb `pm grant` plus a hidden-API exemption | **Yes**: Developer options plus the Terminal toggle | Developer-only: adb or wireless debugging each boot | Yes |
| Guest network | **None** (`vmlauncher_app` only) | NAT via `IVmTethering`; reaches the n0 relays | None | Phone's network |
| Reaching the worker | `VirtualMachine.connectVsock` from the app | Unix socket, broker in the same VM | **None** (no vsock for `shell`) | Unix socket |
| Isolation of jobs | VM per workload (like the Mac) | One VM. Jobs as an unprivileged user beside the broker; Android protected by pKVM | VM per workload | None beyond the app uid |
| VMs / memory | Several, limited by RAM | One, up to ~70% of RAM (use ~50%) | Several | n/a |
| Background | App needs its own foreground service | Terminal's `specialUse` FGS; survived screen-off and forced Doze | `vm` process lifetime | Wake lock, phantom-process limits |
| azula work | Android VM manager, AVF reflection, vsock splice, network proxy | **`LocalBackend` (~500 lines), systemd units, one guest flag** | Unusable without a transport | Same as (b), minus isolation |
| Verdict | Revisit if Google publishes the API | **Recommended** | Research only | Not recommended |

Sizing (b): the prototype is 607 lines added (`local.rs` 491 lines, the
rest host/CLI gating and docs). The design's corrections (socket
activation, a worker running as the job user, `local-setup`, confinement
checks) add about 300–400 more lines, plus about 20 in `azula-guest`.

## Q4. Measurements (Pixel 10a, Terminal VM, 8 vCPU)

| What | Pixel 10a | M3 Pro (macOS host) | Ratio |
|---|---|---|---|
| Terminal VM first boot (cloud-init) | 16.6 s (1.8 kernel + 14.7 user) | | |
| Terminal VM warm boot | 5.9 s (2.65 + 3.2); tap → new crosvm ≈ 10 s | | |
| `vm run` custom kernel → `/init` | 0.42 s guest uptime | | |
| SHA-256, OpenSSL, 16 KB blocks | 1.84 GB/s on 1 core; 10.4 GB/s on 8 (5.6×) | | |
| `gcc -O2 -c sqlite3.c` (1 thread) | 23.2 s (gcc 14.2) | 12.4 s (clang) | 1.9× |
| `cargo build --release` of `azula-guest` (13 crates, LTO) | 23.5 s (rustc 1.85) | 13.4 s (rustc 1.98) | 1.8× |
| `cargo build --release` of `azula-cli` 0.4.1 (424 crates), cold | **3:47** (1298 s CPU, 619%, peak RSS 1.8 GB) | **1:10** (566 s CPU) | 3.2× |
| Same, second build back-to-back | 4:31 (1518 s CPU): throttled ~20% | | |
| Temperatures during the builds | big core 91 °C, skin peak 37.2 °C, battery 34.9 °C; Android thermal status stayed 0 (skin throttling starts at 39 °C) | | |
| `azula compute doctor` from the Mac (relay-only) | bind 0.42 s, dial 154 ms, auth 83 ms, guest 194 ms | | |
| `azula compute exec -- true` round trip | 0.79 s | | |
| 64 MiB push / pull (direct path on the same Wi-Fi) | 5.6 s / 3.4 s (11 / 19 MiB/s) | | |
| 16 MiB push / pull with `AZULA_RELAY_ONLY=1` | 34.7 s / 33.8 s (~0.47 MiB/s; n0 relay rate limiting) | | |
| `vm/e2e/cloud.sh` from the Mac, relay-only, broker under systemd, 4 GB VM | **ALL PASS in 75 s** (doctor, reattach after a forced drop, 9 MB resumable push/pull, build pushed tree in the VM, detach/attach, SIGKILLed client, timeout) | | |

## Incidents worth designing for

1. **The low-memory killer killed the Terminal, and with it the VM, at the
   maximum memory setting.**
   - With Memory size at 5.2 GB and two full builds just done, the guest
     had touched most of its RAM.
   - The prototype's 109 s incremental build then pushed Android below its
     low watermark with swap low.
   - lmkd killed everything down to `com.android.virtualization.terminal`
     itself: pid 10351, `oom_score_adj 0`, "fg TOP".
   - Its phantom processes (`virtmgr`, the vhost-user crosvms) died
     immediately and `crosvm_debian` 26 s later.
   - Reopening the Terminal rebooted the VM cleanly in about a second.
   - Mitigation: about 50% of RAM, and a `MemoryMax=` on the job unit so
     guest page cache stays bounded. Free-page reporting is on
     (`--balloon-page-reporting`), so memory the guest frees does return
     to Android.
2. **Writes from the last seconds before that kill were lost.**
   - Binaries copied about 15 s earlier came back as zero-length files
     (ext4 delayed allocation).
   - A grant minted about 1 s earlier was gone: `grants.tmp<pid>` survived
     but `grants.json` didn't.
   - `write_private_atomic` (`src/compute/grants.rs`) fsyncs the temp file
     but not the parent directory after `rename`, so `azula compute grant`
     can print a token for a grant that doesn't survive a crash. That is
     pre-existing on every host, and fixed in tasks 1.8.
3. **File transfer escapes the job user when the worker is root.** The
   prototype runs `azula-guest` as root with `--run-as azula`:
   - **Jobs were confined.** Reading `~droid/.azula/compute/host.key` and
     listing `/mnt/shared` were both denied, and `sudo` asked for a
     password.
   - **`push` and `pull` were not.** `push` wrote into `/home/droid`, and
     `pull` read `~droid/.azula/compute/host.json` out of a 0700
     directory.

   This is why design D3 runs the worker as the job user.

## Emulator note

The `amper-36` AVD (Android 16 / API 36, arm64, on this M3 Pro) has no AVF:

- no `ro.boot.hypervisor.*` properties;
- no `/dev/kvm`;
- no `com.android.virt` APEX (`/apex/com.android.virt/bin/vm` is absent);
- no `android.software.virtualization_framework` feature.

Nested AVF can't be developed or tested in the emulator on Apple silicon.
The local backend itself can be: it is ordinary aarch64 Linux, testable in
any Debian VM (including `azula vm` on a Mac).

## Blockers that need Sal or Google

- **None for (b).** It needs Developer options and the Linux development
  environment, which Sal enabled for this test. Memory size and Keep awake
  are the phone owner's settings.
- **(a) would need Google** to publish AVF as a public SDK API with VM
  networking for third-party apps. Nothing in Android 17 does that.
