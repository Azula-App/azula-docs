The reference prototype is azula-cli branch `compute-avf-host`. It
contains:
- `vm/android-host`, the Java app;
- `vm/avf-seed`, the seed;
- attach mode in `src/compute/local.rs`;
- `azula-guest --job-env-file`.

It passed `vm/e2e/cloud.sh` relay-only on a Pixel 10a on 2026-11-22. Group 1
must finish before groups 2–4. Group 5 needs groups 1–4.

## 1. Feasibility in azula-app

- [x] 1.1 Spike: can Amper build an Android App Bundle with an on-demand dynamic feature module? It must carry a native library that is extracted and exec-able from the split, plus a service in a `:vmhost` process. Verify with `bundletool build-apks --local-testing`, install on the Pixel under a non-`app.azula` id, and exec the split's `libazula.so`. If Amper can't, record the Gradle shell fallback here and get Sal's choice on an AskUserQuestion card.
  - 2026-11-22: **No**, on 0.11.0 or the latest Kotlin Toolchain 0.14.1.
    - `android/app` is its only Android product type; the generated Gradle project can't be customized; [KTC-5242](https://youtrack.jetbrains.com/issue/KTC-5242) is open.
    - What does work, verified on the Pixel 10a as `app.azula.spike`: an `android/app` with a `:vmhost` service plus `jniLibs/arm64-v8a/`. But Kotlin Toolchain forces uncompressed, unextracted native libs (`BundleConfig.pb` `uncompressNativeLibraries`, and `extractNativeLibs` is ignored). So exec of a bundled binary only worked after a one-byte AAB patch.
    - Sal chose (2026-11-22) **base APK plus a JNI broker** (design D3, D6) over the exec-plus-patch path, a separate Play app, a Gradle shell (1–2 weeks), or waiting on KTC-5242.
- [x] 1.2 Manifest additions in `android-app`: the two VM permissions, `FOREGROUND_SERVICE_SPECIAL_USE`, and the `specialUse` host service with `android:process=":vmhost"` and `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` (justification text in design D8). Verify with `aapt2 dump xmltree` on the built APK.
  - 2026-11-23, azula-app main c2b85ec (29fa512):
    - `aapt2 dump xmltree` shows both VM permissions, `FOREGROUND_SERVICE_SPECIAL_USE`, and `dev.azula.vmhost.HostService` with `process=":vmhost"`, `foregroundServiceType=specialUse` and the subtype property.
    - The APK carries `lib/arm64-v8a/libazula_host.so` and `assets/seed.iso`. Both are gitignored outputs of `scripts/vmhost-artifacts.sh` (sibling build, or `--release` download pinned in `vmhost.version`).

## 2. azula-cli

- [x] 2.1 Land `compute-avf-host` on main, together with or after `compute-local-backend` group 1: attach mode, `--job-env-file` (exec test), and `vm/avf-seed`. Verify with `cargo test --lib compute` and the guest test suite.
  - 2026-11-22: merged as azula-cli e4ef3f1. 96 `compute` tests, the guest suites and clippy are clean. Verified on the Pixel 10a: Terminal mode `cloud.sh` ALL PASS, and attach mode (app-hosted AVF VM, no Terminal app, connect-only broker) ALL PASS, both relay-only. The branch and worktree are removed.
- [x] 2.2 The JNI broker: a new azula-cli crate (`android-host-jni`) that builds an `aarch64-linux-android` `cdylib`, `libazula_host.so`, with the NDK. It exposes `start(configJson)`, `stop()`, `mintGrant(ttl, label)`, `listGrants()` and `revoke(id)` over the `compute` attach-mode broker. Release attaches it, plus `vm/avf-seed/build-seed.sh`'s `seed.iso`, as artifacts the app build consumes. Verify the library loads and serves `compute doctor` from a test app on the Pixel, and that the artifacts attach to a dry-run release.
  - 2026-11-23: library done, on azula-cli main (merge deb0668).
    - It's 14.8 MB stripped, 6.1 MB gzipped.
    - On the Pixel 10a the prototype app, installed as `app.azula.avfhost.jni`, runs the broker in-process; `virtmgr` is the app's only child.
    - Relay-only from the Mac: `compute doctor` passes every stage and `vm/e2e/cloud.sh` is ALL PASS. A JNI `revoke` returns true.
    - 2026-11-23, release wiring on azula-cli main (0e8f937):
      - `release.yml` gains an `android-host` job (ubuntu, NDK) and an `avf-seed` job (macos-15). On a `v*` tag they attach `azula-host-android-<version>-aarch64.tar.gz` and `azula-avf-seed-<version>.iso`, each with a `.sha256`.
      - A `workflow_dispatch` build-only run uploads them as workflow artifacts and skips every publish job.
      - Verified: run 45114819456 succeeded. The `.so` is an aarch64 shared object exporting the five `Java_app_azula_vmhost_AzulaHost_*` symbols. The ISO is labelled `cidata` and holds `user-data`, `meta-data`, `azula-guest`, `azula-vsock-proxy` and `azula-timesync`. Both sha256 files match.
      - The tag-triggered attach is first exercised at the next CLI release.

## 3. The host in azula-app (base APK, `:vmhost`)

- [x] 3.1 Port the prototype's `HostService`, `Bridge`, `Proxy` and `Splice` to Kotlin, in new `vmhost-api`/`vmhost-real` modules (the api/real convention), running in `:vmhost` with a notification and a Stop action, and calling `libazula_host.so` instead of a child broker. Resolve the hidden API through `HiddenApiBypass`, with a capability check that disables hosting cleanly when it fails. Verify START reaches a reachable worker in under 20 s on the Pixel 10a after the first boot.
  - 2026-11-23, azula-app main c2b85ec (f96201a):
    - **Modules:** `vmhost-api`, `vmhost-avf-stubs` (compile-only, not dexed), `vmhost-real` and `vmhost-testapp`, in package `dev.azula.vmhost`. The JNI class stays `app.azula.vmhost.AzulaHost`.
    - **Cross-process state:** an atomic JSON file plus `FileObserver`. Mint, list and revoke go over a bound `Messenger`.
    - **On the Pixel 10a as `app.azula.vmhost.test`:** first boot reached RUNNING at about 160 s. A later START had every `compute doctor` stage passing in **17 s**. `vm/e2e/cloud.sh` was ALL PASS relay-only.
    - **Tests:** `vmhost-api` 19 and `vmhost-real` 16 pass.
    - **Not covered here:** disk staging from external files until 3.2 lands; no automatic restart if the whole `:vmhost` process is killed (the UI shows an error).
- [x] 3.2 Image management: download `debian-13-generic-arm64.tar.xz`, verify it against `SHA512SUMS`, extract `disk.raw` with an xz decoder, and grow it to 16 GiB. Check free space first, and show progress. Ship `seed.iso` as an app asset. Verify a corrupted download is rejected and retried.
  - 2026-11-23, azula-app main 8f94075.
    - **API:** `VmHost.provision()` (idempotent, resumable, ends RUNNING), and `HostPhase.PROVISIONING` with `ProvisionStep`, byte progress and `retryable`.
    - **Tests:** vmhost-api 24 and vmhost-real 45. These include a local-HTTP end-to-end test for drop, resume, tamper and low space.
    - **On the Pixel 10a** (fresh `app.azula.vmhost.test`):

      | Step | Time |
      |---|---|
      | Download, 300 MB | 17.6 s (about 17 MB/s) |
      | Verify | 0.4 s |
      | Extract to 1.17 GB, sparse, 16 GiB apparent | 64 s |
      | First boot to RUNNING | 142 s |

    - **Resume and tamper:** a `kill -9` at about 112 MB resumed from the `.part` offset. A tampered `.part` failed SHA-512 and redownloaded from 0. `compute doctor` passed relay-only.
    - **For 3.6:** `pm grant` of these permissions kills the whole app, including `:vmhost` ("changed gids"). `HostService` is `START_STICKY` until setup is complete, so it resumes after the kill (verified after `kill -9`, not yet after a real grant). The UI should also call `provision()` on resume.
- [x] 3.3 The one-time grant: an embedded adb client for wireless-debugging pairing (a pairing code entered in a notification, then TLS) that runs `pm grant` for both permissions, with onboarding screens. Detect existing grants, and say which one is missing. Verify on a phone that has never been granted, with no computer attached.
  - 2026-11-23: modules `selfgrant-api`, `selfgrant-real` and the `selfgrant-testapp` test app (`app.azula.selfgrant.test`), package `dev.azula.selfgrant`.
    - **Implementation:** a pure-Kotlin port of BoringSSL's SPAKE2 (`spake25519.cc`, ISC). Tests regenerate the M and N points from their seeds and check RFC 8032 Ed25519. The adb client flow follows Shizuku's (Apache-2.0) as reference. 36 JVM tests pass.
    - **On the Pixel 10a (Android 17), with neither permission granted and no USB adb grant:**
      - the pairing service is found about 1.8 s after the Settings dialog opens;
      - after the code is entered by notification reply, pairing takes 0.4 s and the grant is done about 2 s later;
      - `dumpsys` then shows both `granted=true`.
    - **Resume:** after `kill -9` mid-flow (phase AwaitingCode), the sticky service restarted and re-prompted about 2 s later, then finished.
    - **`pm grant` kills the app process** (gid change). The restarted service detects both grants and finishes.
- [x] 3.4 The grant UI: mint, copy and QR-code a compute grant, list grants, and revoke them, through the JNI broker's `mintGrant`/`listGrants`/`revoke`. Verify a minted token works from the Mac relay-only.
  - 2026-11-23, azula-app main a62e4cc (S4/S5 of the setup flow). On the Pixel 10a as `app.azula.dev`: a token minted in S5 passed every `compute doctor` stage relay-only and ran `compute exec -- uname -a`. After revoke in S4, the same token failed at auth with "unauthorized".
- [ ] 3.5 Find out whether turning Developer options off revokes the grants (design open question). Record the result here and in the onboarding copy.
  - 2026-11-23, from source (not device-tested, because turning Developer options off on the test phone would cut USB adb):
    - **Not revoked.** `PermissionManagerServiceImpl` keeps previously granted `development`-flag permissions (`bp.isDevelopment() && origState.isPermissionGranted`).
    - Settings' `DevelopmentSettingsDashboardFragment.disableDeveloperOptions()` only flips the global setting and calls each controller's `onDeveloperOptionsDisabled`.
    - Onboarding can say "you can turn developer options and wireless debugging off now", pending one device confirmation by someone at the phone.
- [x] 3.6 The setup flow, exactly as design D9 (approved by Sal 2026-11-22):
  - S0, the single entry;
  - S1, the capability check with defaults and the "advanced" panel;
  - S2, the checklist, with:
    - detection on resume;
    - just-in-time `POST_NOTIFICATIONS`;
    - mDNS `_adb-tls-pairing._tcp` discovery;
    - code entry by notification reply;
    - automatic grant and return;
  - S3, hands-off provisioning that starts at "set up";
  - S4, Ready, with hosting on/off and grants;
  - S5, the connect sheet, with the snippet as copy, share and QR;
  - the D9 error table.

  Each step persists its state and resumes after process death. Use the existing surface recipes and `*StepContent` pattern, with copy in the azula voice. Verify with Compose UI tests in the `-mock` app for every screen and error state, plus a process-death test on the Pixel for S2 and S3.
  - 2026-11-23, azula-app main a62e4cc.
    - **Code:** `shared/src/dev/azula/ui/host/` (S0–S5) and `HostSetupService`. `VmHost`, `VmPermissionGranter` and `HostPlatform` are bound for Android only; JVM and iOS show no entry.
    - **Hidden in release builds:** the entry shows only in debuggable builds, or after 7 taps on the "profiles & settings" title (labs). That's why there's no CHANGELOG entry yet.
    - **Tests:** 54 new (18 `HostSetupServiceTest`, 36 Compose `HostComputeUiTest`) cover every screen and error-table state. `./check` is green.
    - **Device (`app.azula.dev`, Pixel 10a):** "set up" to Ready took 4 min 50 s, about 13 taps, with no input after the grant. Download and unpack (about 1 min) ran in parallel with S2. The grant came about 6 s after the code, and first boot to RUNNING took about 2.5 min.
    - **Gid kill:** the `pm grant` killed the app and `:vmhost`. The sticky service resumed, and "done — back to azula" landed on the right step.
    - **Deviations:**
      - `VmHost.setPlanOverride` was added so "advanced" can reach the VM.
      - Retry is two automatic attempts, then a button.
      - S2's checklist stays visible, all ticked, until Ready.
- [x] 3.7 Measure setup on the Pixel 10a.
  - **Starting state:** a fresh install under a non-`app.azula` id (e.g. `app.azula.debug`), both VM permissions not granted, Wireless debugging with no paired devices, no computer used for any step. adb stays attached only to record.
  - **Record:** time and deliberate taps from the first "host compute on this phone" to Ready. Measure once with Developer options already on, excluding download time, which is recorded separately. Add the 7-tap Build-number path as a note.
  - **Evidence:** a screen recording (`adb shell screenrecord`) or a screenshot per step, kept with the change. Send the result to Sal with SendUserFile.
  - **Target:** about 2 minutes and about 10 taps. Over that, the flow gets another pass before 4.1.
  - 2026-11-23, Pixel 10a, `app.azula.dev` built from azula-app main plus the fix below.
    - **Starting state:** data cleared, both grants revoked, notifications allowed at first launch, Developer options on, Wireless debugging off with no azula pairing. USB adb stayed attached only to drive input and record.
    - **Result: 3 min 58 s and 11 taps to Ready, 12 with the optional "done — back to azula". Over target.** Contact sheet: [`design-pages/setup-3.7-contact-sheet.jpg`](design-pages/setup-3.7-contact-sheet.jpg); home-network identifiers are redacted. The screen recording went to Sal and isn't committed, because it shows the home Wi-Fi's SSID and BSSID.
    - **Hands-on:** 1 min 32 s from the entry tap to sending the code; the grant was held 0.5 s later. About 40 s of that is the driver pausing to read the screen.
    - **Taps:** host compute → set up → open wireless debugging → the Wireless debugging row → its toggle → OK → allow on this network → pair device with pairing code → pull down the shade → enter code (and type 6 digits) → send. The 12th, "done", only brings the user back: the VM had started 2 s after the grant.
    - **Download** (recorded separately, overlapped with the permission steps): 286 MB in 17.0 s, verify 0.4 s, unpack 64.7 s. The image was ready 82.5 s after "set up", 4.8 s before the grant. It wasn't on the critical path here, but it would be for a faster user.
    - **First boot:** 143.6 s from `run()` to RUNNING. 121.6 s of it (guest uptime 9.8 s → 131.4 s) is `systemd-networkd-wait-online` timing out. The guest has no NIC, and the seed masks that unit only in cloud-final, after the first boot has already paid for it. Without the stall, first boot is about 22 s and the total about 2 minutes.
    - **Bug found and fixed** (azula-app `1140393`): the self-grant flow and the host service shared notification id 7301. The host re-posts it on every download-progress tick, so the code prompt was replaced within about 1.5 s. Run 1 stalled at step 8 because of it; any user whose download was still running would have too. The 3.6 walkthrough missed it because its download had finished first. The same commit keeps the pairing code out of logcat.
    - **Other findings:**
      - Settings opens Developer options with the Wireless debugging row in view, not the subpage. Android 17 exports no entry to the subpage (`:settings:show_fragment` is ignored), so step 4 stays.
      - The heads-up "enter code" is tappable over the pairing dialog, which saves step 9 for a quick user.
      - "done" arrives 12 s after the grant, because of Android's restart backoff for the killed self-grant service. It doesn't delay Ready.
      - Denying notifications at first launch adds 2 taps (from the 3.6 walkthrough). Developer options off adds 7 Build-number taps, plus the PIN and the trip to About phone.
- [ ] 3.8 A second pass on setup before 4.1, because 3.7 was over target.
  - Remove the first-boot `wait-online` stall (about 2 min). The guest's network config should satisfy or skip `systemd-networkd-wait-online` from cloud-init's init-local stage (for example through the NoCloud `network-config`), not mask it in cloud-final. Verify: first boot under 30 s on the Pixel, and no `wait-online` timeout in the console log.
  - Once that's gone, unpack (65 s) becomes the critical path for a fast user. Consider extracting while downloading, or a faster codec.
  - Re-measure as in 3.7. The target is unchanged.
  - 2026-11-23, first pass (azula-cli `fa9dfb1`, azula-app `aedf972`):
    - **`wait-online` stall: removed.** The seed adds a NoCloud `network-config` with a dummy link (`azula0`, 192.0.2.1/32), which cloud-init renders in init-local, so `wait-online` succeeds at once.
      - Under QEMU (no NIC, same image and cloud-init 25.1.4), cloud-init's network stage starts at 3.1 s, against 123.2 s before.
      - On the Pixel, first boot reaches login in 24.8 s, against about 140 s.
    - **Ready now waits for the tools (a D9 fix).** In 3.7, Ready came at getty's login prompt, about 95 s before the seed's `apt-get install build-essential git file` finished. A cloud session connected at Ready could find no git, or a held dpkg lock.
      - On first boot, the host now also waits for the seed's `AZULA-SEED provision rc=` console line, with a 15-min backstop.
      - The S3 copy changed from "about 4 min" to "about 2 min".
    - **Re-measured, run 3:** `app.azula.dev` with data cleared and grants revoked. Wireless debugging was already on, because adb was wireless (the phone had been unplugged), so steps 4–7 of 3.7 were skipped.
      - Entry to Ready (tools installed): **3 min 05 s**.
      - Grant at +44.5 s. Download 17.6 s, then unpack, which the grant's gid kill interrupted 21.5 s in. The unpack restarted from zero and took 64.0 s. Then boot to login 24.8 s, and tools 49.5 s (rc=0).
      - At 3.7's hands-on pace (grant at +93 s, image ready first), Ready would be about **2 min 50 s**, against 3.7's 3 min 58 s before tools, or about 5 min 33 s with them.
      - Doctor passed every stage relay-only. A job saw git 2.47.3 and gcc 14.2, and the guest clock matched UTC. A revoked token got `unauthorized`.
    - **Still over the 2-minute target, and it can't be reached by tuning.** From "set up", image prep takes about 82 s and boot plus tools about 74 s, one after the other, so Ready can't come before about 2 min 40 s. What's left is a choice for Sal: pre-baked tools, a faster image codec, deferring `pm grant` until the image is ready (which avoids the restarted unpack), or Ready before the tools behind a job gate.

## 4. Play

- [ ] 4.1 Target API 36 or later, and the Play Console foreground-service declaration with the D8 justification and a demo video. Verify through an internal-testing track upload.
- [ ] 4.2 Review the pre-launch report's non-SDK warnings, and record them.

## 5. Verification

- [ ] 5.1 Run `vm/e2e/cloud.sh` from a Claude Code cloud sandbox (`azula-cli` environment) against the feature build on the Pixel 10a, with the Terminal app not running. Record the timings here.
- [ ] 5.2 Soak overnight, unplugged with the screen off: a job heartbeats every minute. Record gaps, battery drain and thermal status.
- [ ] 5.3 Run the boot and `cloud.sh` matrix on a Pixel 6 or 7 and a Pixel 8 or 9, Android 16 and 17.

## Workflow follow-up

- On archive, fold the delta into `specs/remote-compute/spec.md`, and add an "Android app host" section to `specs/remote-compute/design.md` that links the findings page.
