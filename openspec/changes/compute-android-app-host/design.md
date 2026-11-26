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
https, and turns off apt's HTTP pipelining (Debian's CDN stops answering
pipelined requests, which made apt wait 30 s about half the time). Its tools
are `build-essential git file`, installed by the `azula-provision` service,
which retries until git, gcc, make and file run and reports each attempt on
the console. Its `network-config` gives
the guest a dummy link (`azula0`, 192.0.2.1/32) that cloud-init renders
before networkd starts. Without it, `systemd-networkd-wait-online` would
wait 2 minutes for a NIC that doesn't exist on the first boot, because
user-data can only mask it afterwards (measured in task 3.7, fixed in 3.8).

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

The same library carries a second, independent class, `NativeXz`: a
pull-based, threaded liblzma decoder that unpacks the guest image while it
downloads (D9 S3). It's bounds-checked, contains panics, and falls back to
the Java decoder when the library doesn't load.

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

### D9. The setup flow: one entry, no questions, a guided grant

Sal requires (2026-11-22) that setup be easy and streamlined, and that is
a requirement, not polish. Design targets:
- **About 2 minutes and about 10 deliberate taps** from first tap to
  Ready, excluding the image download, for a user whose Developer options
  are already on.
- **The download runs during the grant step.** Downloading needs no
  permission, so it starts the moment the user commits.
- **Copy** follows the azula voice (§9.6): lowercase, `·` separators.
- **Surfaces** use the existing recipes (design system §7.5): raised
  cards, muted panels, the primary button with glow halo, `StatusDot`, and
  the onboarding `*StepContent` pattern.

**S0 · Entry.** One `SettingsRow` in Settings: "host compute on this
phone". There is also a Home card once the device is known to qualify. It
is the only way in.

**S1 · Capability check.** This is automatic and takes under a second.
Nothing has been downloaded or granted yet.
- **Checks:** AVF non-protected VMs (`getCapabilities`, and
  `ro.boot.hypervisor.vm.supported`), Android 14+, RAM of at least 6 GiB,
  free space of at least 20 GiB, and that the hidden-API exemption works.
- **Pass:** a raised card with the summary "this phone can host · 8 cores
  · 4 GB for jobs · 16 GB disk · 0.4 GB download". The sizes are the
  defaults: about 50% of RAM, and the disk is `min(16 GiB, 25% of free
  space)`. "advanced" (a muted, collapsed panel) changes them. There's one
  primary button, **set up**.
- **Fail:** one plain sentence saying why, for example "this phone can't
  run azula vms — its hypervisor only allows protected vms" or "needs 20 GB
  free · 9 GB free now". It offers a link to the Terminal-app path where
  that path applies, and nothing to tap through.

**S2 · Permission (one-time).** This only appears if either VM permission
is missing. Tapping **set up** also starts S3's download in the background.
The card is a three-line checklist, each line with a `StatusDot`, and the
app re-detects state every time it resumes.
1. **"developer options".**
   - If on, it's ticked already. On Android 17 the app reads `development_settings_enabled` as 0 even when it's on, so detection also checks whether Settings resolves the Developer options activity, which AOSP disables while they're off.
   - If off, it shows the button **open about phone** with the hint "tap
     build number 7 times, then come back". That's a deep link to
     `ACTION_DEVICE_INFO_SETTINGS`; an app can't toggle Developer
     options.
   - The line ticks itself when the user returns.
2. **"wireless debugging".**
   - The button **open wireless debugging** deep-links to Developer options
     with Wireless debugging highlighted, with the hint "turn it on, then
     tap *pair device with pairing code*".
   - Just before this, the app requests `POST_NOTIFICATIONS`, the system
     dialog, because the code entry lives in a notification.
   - Meanwhile the app discovers the pairing service over mDNS
     (`_adb-tls-pairing._tcp`), so the user never types a port.
   - As soon as the service appears, azula posts a notification "enter the
     6-digit pairing code" with an inline reply field. The user types the
     code without leaving Settings.
3. **"permission granted".** azula then:
   - pairs, and connects to `_adb-tls-connect._tcp`;
   - runs `pm grant app.azula` for both permissions;
   - verifies them;
   - posts "done — back to azula", which returns to the app.

   The step persists its progress (pairing key, current line), so an
   app switch, process death or reboot resumes on the right line. After
   success it adds one line: "you can turn wireless debugging and developer
   options off now". Turning Developer options off keeps the grants (task 3.5,
   checked on a Pixel 10a).

**S3 · Provisioning (hands-off).**
- **What runs:** a progress foreground notification plus an in-app
  stepper:
  1. downloading debian · 0.4 GB (resumable over HTTP ranges, checked
     against `SHA512SUMS`), and unpacking it meanwhile with a threaded native
     xz decoder in `libazula_host.so` (`NativeXz`);
  2. preparing disk;
  3. first boot · installing tools (about 2 min). Ready waits for the
     seed to report its tool install, so a cloud session connected at Ready
     finds git and build-essential, and no held dpkg lock.
- **The user can leave.** Each stage resumes after process death.
- **Recoverable failures retry with backoff** and show one line plus
  **retry**: no network, low storage (a recomputed space figure), or a
  checksum mismatch (re-download the bad part).
- **It ends at S4 with no input.**

**S4 · Ready.** A raised card with a `StatusDot`: "hosting · running · 8
cores · 4 GB · 16 GB". It has:
- a **hosting** toggle;
- the primary button **connect a cloud session**;
- below that, active grants, each with **revoke**.

The foreground notification carries **stop**. If the VM dies, the status
reads "restarting…" and the app restarts it once on its own; repeated
failures show the cause.

**S5 · Connect a cloud session.** A bottom sheet, in the style of
`CreateInviteSheet`.
- **Grant:** azula mints a grant right away (default 6 h, with chips for 1
  h, 6 h and 7 d) and auto-labels it "cloud session · {time}".
- **Snippet** (copy, share, or `QrView`):

  ```
  export AZULA_COMPUTE_TOKEN='azc1.…' AZULA_RELAY_ONLY=1
  npx -y @azula-app/cli compute doctor && npx -y @azula-app/cli compute exec -- uname -a
  ```

- **Under the snippet**, a muted panel: "the cloud environment must allow
  the n0 relay hosts · how" (a link to the site docs).

**Errors that fix themselves or say exactly what to do.**

| Situation | What azula does |
|---|---|
| A grant is missing or revoked | S4 shows "permission missing", and the single button re-runs only S2 |
| Developer options turned off | If that revokes grants (task 3.5), same as the row above. If not, nothing. |
| Low storage | The exact space needed and what's free now. Provisioning resumes on **retry**. |
| Download or checksum failure | An automatic retry with backoff. After three failures, one line plus **retry**. |
| The tools didn't install (no network) | The guest retries by itself, and S3 says "installing tools · no luck yet, trying again". After 15 min: "couldn't install the tools · check the network, then retry". Never Ready. |
| VM killed (LMK, crash) | Automatic restart once. "restarting…" then running. If it repeats, "stopped — {cause}" plus **start**. |
| Phone can't host | Said at S1, before any download or grant |

**Tap count at the targets** (for a user whose Developer options are
already on):
1. set up
2. allow notifications
3. open wireless debugging
4. turn it on
5. confirm the dialog
6. pair device with pairing code
7. enter the code in the notification (typing)
8. send
9. back to azula

That's 9 deliberate taps plus typing the code. Turning Wireless debugging on also shows two system dialogs, "Allow wireless debugging?" and "on this network?" (measured 2026-11-23), so expect about 11. Ready follows without
input. Turning on Developer options adds 7 taps on Build number plus
navigation. Task 3.7 measures the real numbers.

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
- **[The seed's worker runs as root.]** The AVF guest's worker is started as
  root with `--run-as azula`. Exec children, and since azula-cli 67ff0b1
  (2026-11-24) put, get and a job's `cwd` too, act with the job user's
  credentials, so a transfer reaches what a job can. The job user has
  passwordless sudo in this guest, so none of that is a boundary here. The
  local backend (`compute-local-backend`) runs its worker as the job user.
- **[Wireless debugging needs Wi-Fi]** for the one-time pairing. Document
  it, with computer adb as the alternative.

## Migration Plan

1. Land azula-cli's prototype branch work: attach mode, `--job-env-file`,
   `vm/avf-seed`, and the musl broker build in release.
2. Build the host into azula-app's base APK, with the JNI broker (D3, D6).
3. Ship it behind a settings entry that's hidden until the feature works
   on Pixel 8, 9, 10a and 11. (Pixel 6 and 7 are unverified: Test Lab has
   them only below minSdk 34.)
4. Then submit to Play.

Rollback: hide the entry. The base APK carries only manifest declarations.

## Open Questions

- ~~Does turning Developer options off revoke `development`-flag grants?~~
  No: the grants survive and the host keeps working (task 3.5, Pixel 10a,
  Android 17, 2026-11-25). It cuts adb, and leaves the Terminal alone as long
  as "Linux development environment" isn't touched.
- Should the host restart automatically after a reboot, given the Android
  15+ boot-FGS restrictions?
