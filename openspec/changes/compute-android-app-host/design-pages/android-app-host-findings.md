# The azula app as the VM host (no Terminal app): findings

Research and prototype from 2026-11-22, on Sal's Pixel 10a: stock, locked,
Android 17 `CP3A.261005.005`, Tensor G4, 7.4 GiB of RAM.

This revisits option (a) of
[`compute-local-backend/design-pages/android-pkvm-findings.md`](../../compute-local-backend/design-pages/android-pkvm-findings.md),
which had rejected it. The prototype is `app.azula.avfhost`, a separate
application id kept clear of `app.azula`'s migration fixture. Its code is
on azula-cli branch `compute-avf-host` (`vm/android-host`, `vm/avf-seed`,
attach mode in `src/compute/local.rs`).

## Verdict

**An app can host the compute VM without the Terminal app, and Play policy
doesn't stand in the way. Two one-time costs remain: a `pm grant` of two
`development` permissions, and a hidden-API exemption.**

`vm/e2e/cloud.sh` passed **ALL** steps relay-only in **74 s** against a VM
hosted by `app.azula.avfhost`, with the Terminal app force-stopped. Covered:
- doctor;
- exit codes and separate streams;
- reattach after a forced drop;
- 9 MB resumable push and pull;
- building a pushed C tree in the VM;
- detach and attach;
- a SIGKILLed client;
- timeout.

No route avoids the grant, so the user does it once, on the phone, through
wireless-debugging pairing. Sal chose that on 2026-11-22.

## Architecture as built

```
cloud sandbox ──iroh relay──▶ libazula.so (static musl azula, child of the app)
                                compute serve --local --worker-socket files/run/worker.sock
                                        │ Unix socket (0700 dir, app-private)
                                app Bridge ──VirtualMachine.connectVsock(1024)──▶ azula-guest
                                app Proxy  ◀──pooled connectVsock(3129)──── azula-vsock-proxy (127.0.0.1:3128)
                                        │ HTTP CONNECT / absolute-form → internet
AVF: app (untrusted_app_34) → virtmgr (untrusted_app_all_virtualizationmanager)
       → crosvm (untrusted_app_all_virtmgr_crosvm)
Guest: stock debian-13-generic-arm64, EFI via /apex/com.android.virt/etc/u-boot.bin,
       + cloud-init NoCloud seed ISO (vm/avf-seed), no NIC
```

## What was verified on the device

| Claim | Evidence |
|---|---|
| The permissions take one `pm grant` each, and stick | `adb shell pm grant app.azula.avfhost android.permission.{MANAGE,USE_CUSTOM}_VIRTUAL_MACHINE`. Both still `granted=true` after `adb install -r` and after a reboot. |
| An in-process hidden-API exemption works on Android 17 | LSPosed `org.lsposed.hiddenapibypass` 6.2: `addHiddenApiExemptions("L")` returned true. Probe: blocked `VMRuntime.setHiddenApiExemptions` was unreachable before and reachable after. The AVF `@hide` constructor resolved. |
| The AVF API needed is all present | `VirtualMachineCustomImageConfig.Builder` (`setBootloaderPath`, `addDisk(Disk.RWDisk/RODisk)`, `useNetwork`), `VirtualMachineConfig.Builder(Context).setCustomImageConfig/setMemoryBytes/setCpuTopology`, `VirtualMachineManager.getOrCreate`, `VirtualMachine.run/connectVsock(long)`. Dumped from the device's `framework-virtualization.jar`. |
| The stock Debian cloud image boots under AVF | It boots with AVF's own `u-boot.bin` (U-Boot 2025.01, EFI → GRUB → `6.12.117+deb13-arm64`), first via `vm run` as shell, then from the app. |
| SELinux supports third-party hosts | `plat_sepolicy.cil`: `typetransition untrusted_app_all virtualizationmanager_exec process untrusted_app_all_virtualizationmanager`, and the app may read and write virtmgr-created vsock fds. Observed: virtmgr ran as `untrusted_app_all_virtualizationmanager`, and crosvm as `untrusted_app_all_virtmgr_crosvm`. |
| A static Linux broker reaches the relays from Android userland | n0 DNS falls back to built-in resolvers, and TLS to embedded roots. netlink is denied, which is a WARN only. |
| The guest has no NIC and no RTC | `useNetwork` has no effect for apps (`vm check-feature-enabled network`: disabled). u-boot lists `rtc-pl031 … <none>`, so the guest booted at 13 Apr 2026. `azula-timesync` fixed it through the proxy. |

## Measurements

| What | Result |
|---|---|
| First START, from the external file to `login:` | 163 s: an 18 s copy of the 3 GB disk, then the one-time 120 s `networkd-wait-online` stall (no NIC), which the seed now masks |
| First-boot provisioning (apt over the proxy: build-essential, git, file) | `provision rc=0` at guest uptime 238 s. About 128 MB came from deb.debian.org at about 2.5 MB/s. |
| START to `login:`, disk already staged | 13.4 s (from the prototype's agent) |
| After a phone reboot: START to `compute doctor --vm` guest stage passing (relay) | **14.1 s** |
| `compute doctor` relay-only from the Mac | bind and relay 0.44 s, dial 55–321 ms, auth 78–116 ms, guest 209–211 ms |
| `vm/e2e/cloud.sh` relay-only | **ALL PASS, 74 s** |
| Job `curl` of 100 MiB through the vsock proxy | 7.7–8.1 MB/s. The Mac, direct, on the same file: 14 MB/s. |
| Job: `apt-get install cargo`, `git clone` from GitHub, crates.io fetch, `cargo build --release` of `vm/guest` | all through the proxy: clone 1 s, fetch 2 s, build 35 s (8 vCPU, 4 GiB) |
| Forced deep Doze with the screen off | relay `exec` worked after 60 s idle; 20 MiB through the proxy in 4.6 s |
| UI closed (`finishAndRemoveTask`) | the VM keeps running |
| App process killed | `virtmgr` and `crosvm` die at once (they are the app's phantom processes), and the VM goes with them |

## Play: policy and requirements

The research report lists every source. The ones that decide the
questions:
- **Hidden APIs.** I found no Developer Program Policy text that bans
  non-SDK interfaces or bypass libraries. The platform doc
  ([restrictions-non-sdk-interfaces](https://developer.android.com/guide/app-compatibility/restrictions-non-sdk-interfaces))
  describes runtime enforcement. Its only Play mention is "If your app uses
  non-SDK interfaces, an error or warning displays in the pre-launch
  report". I found no case of Play removing an app for hidden-API use.
- **Downloaded code.**
  [Device and Network Abuse](https://support.google.com/googleplay/android-developer/answer/9888379)
  says: "an app may not download executable code (such as dex, JAR, .so
  files) from a source other than Google Play". Its exception reads: "This
  restriction does not apply to code that runs in a virtual machine or an
  interpreter where either provides indirect access to Android APIs". A
  Debian image in a pKVM guest that reaches Android only through what the
  app mediates fits that exception. That's our reading, not a Google
  ruling.
- **Asking users to grant over adb.**
  - [Shizuku](https://play.google.com/store/apps/details?id=moe.shizuku.privileged.api)
    is on Play, and its [setup](https://shizuku.rikka.app/guide/setup/) pairs
    over Wireless debugging on the device, with "no connection to a
    computer".
  - [LADB](https://play.google.com/store/apps/details?id=com.draco.ladb),
    also on Play, embeds an adb client.
  - I found no policy restricting apps that walk users through Developer
    options.
- **Target API.** New apps and updates must target API 36 or later from
  2026-08-31
  ([target-sdk](https://developer.android.com/google/play/requirements/target-sdk)).
- **Foreground service.** `specialUse` "covers any valid foreground service
  use cases that aren't covered by the other foreground service types". Its
  subtype property is free-form text, and both are "reviewed when you
  submit your app in the Google Play Console"
  ([service types](https://developer.android.com/develop/background-work/services/fgs/service-types)).
  No other type fits a VM host: `mediaProcessing` is capped at 6 h per 24
  h, and `systemExempted` is for system apps.

## Grant-free routes: none exist today

- **`preinstalled`** covers apps on the system image. A new Play install
  can never qualify. AOSP's README:
  "Android 15: preinstalled apps in general"
  ([README](https://android.googlesource.com/platform/packages/modules/Virtualization/+/refs/heads/main/libs/framework-virtualization/README.md)).
- **No role, intent, Play-services API or Terminal delegation.** The
  Terminal exports only its launcher and a documents provider (manifest
  dumped from the device). Community hosts
  ([TerminalAppPlus](https://github.com/KawaiiHachimi/TerminalAppPlus),
  [koiTerminal](https://github.com/outlawsanzhang/koiTerminal)) use the same
  `pm grant` route, or Shizuku.
- **Upcoming changes.**
  - [`avf_flags.aconfig`](https://android.googlesource.com/platform/packages/modules/Virtualization/+/main/build/avf_flags.aconfig)
    only promotes `setShouldUseHugepages` to `@SystemApi` and adds
    Terminal GUI and storage features.
  - `VirtualMachineManager` has no `@FlaggedApi`.
  - The Googlebook "Linux Terminal preview VM" post (2026-10-12) says
    nothing about third-party AVF access.
  - Android 18 notes weren't available.
  - Nothing found opens AVF to third-party apps.

## Native client vs. hidden-API bypass

A native client is possible as far as SELinux goes: exec `virtmgr` from the
app, then RPC binder over a socketpair. But every AIDL module in the APEX
is `unstable: true`
([Android.bp](https://android.googlesource.com/platform/packages/modules/Virtualization/+/refs/heads/main/android/virtualizationservice/aidl/Android.bp)).
The APEX updates through Play system updates, and we'd have to ship
libbinder's RPC client. The Java `@SystemApi` with the in-process exemption
is the smaller and more stable risk. The `@hide` custom-image builder needs
version-checked reflection.

## Setup steps for a user (target product)

1. **Get azula with the host feature.** Install or update azula from Play
   and open Settings → Host compute on this phone. azula downloads the host
   feature (about 30 MB) and the Debian image (about 0.4 GB compressed),
   which it checks against Debian's `SHA512SUMS` and grows to 16 GB.
2. **Grant the VM permissions, once, on the phone.**
   - Turn on Developer options by tapping Build number seven times.
   - Turn on Wireless debugging (Wi-Fi is needed).
   - Tap "Pair device with pairing code".
   - Type the code into azula's notification. azula grants itself the two
     VM permissions. That takes about a minute, and the grants survive
     reboots and updates.
3. **Start hosting.** Tap Start hosting. A notification with Stop appears,
   and the VM is reachable in about 14 s.
4. **Connect a cloud session.** Mint a grant and copy the `azc1.` token
   into the cloud session, which uses `npx -y @azula-app/cli@0.4.2 compute
   exec …` with `AZULA_RELAY_ONLY=1`.
5. **Plug the phone in.** Keep it on a charger for long jobs.

## Setup steps for the prototype (today)

```bash
cd vm/avf-seed && ./build-seed.sh                       # seed.iso
B=$(vm/android-host/build-broker.sh)                    # static musl azula
cd vm/android-host && AZULA_BROKER_BIN=$B ./build.sh    # .build/avfhost.apk
adb install -r .build/avfhost.apk
adb shell pm grant app.azula.avfhost android.permission.MANAGE_VIRTUAL_MACHINE
adb shell pm grant app.azula.avfhost android.permission.USE_CUSTOM_VIRTUAL_MACHINE
adb push ~/.azula/vm/images/debian-13-generic-arm64/disk.raw /sdcard/Android/data/app.azula.avfhost/files/disk.raw
adb push vm/avf-seed/.build/seed.iso /sdcard/Android/data/app.azula.avfhost/files/seed.iso
adb shell am start-foreground-service -n app.azula.avfhost/.HostService -a app.azula.avfhost.START
adb shell am start-foreground-service -n app.azula.avfhost/.HostService -a app.azula.avfhost.MINT --es ttl 6h --es label me
adb shell run-as app.azula.avfhost cat files/token.json
```

## Gotchas found on the way

- `VirtualMachineManager.getOrCreate()` returns an existing instance with
  its **old** config. The prototype's first seeded boot silently had no
  seed disk. Delete and recreate on every start.
- No NIC means `systemd-networkd-wait-online` stalls every boot for 2
  minutes. The seed masks it after the first boot. Baking the mask into
  the image would avoid even the first stall.
- `connectVsock(port)` to a port with nothing listening throws
  `ServiceSpecificException: Failed to connect` (ENODEV). It doesn't return
  a dead fd, so the proxy pool retries every second until the guest shim
  is up.
- Reinstalling the app (`install -r`) kills its process, and with it the
  VM. That's expected, given the phantom processes.
- Two 4 GB VMs (the Terminal's plus the app's) on an 8 GB phone invite the
  LMK. Force-stop the Terminal while testing.
