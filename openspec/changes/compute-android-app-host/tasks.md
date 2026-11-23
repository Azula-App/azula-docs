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
- [ ] 1.2 Manifest additions in `android-app`: the two VM permissions, `FOREGROUND_SERVICE_SPECIAL_USE`, and the `specialUse` host service with `android:process=":vmhost"` and `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` (justification text in design D8). Verify with `aapt2 dump xmltree` on the built APK.

## 2. azula-cli

- [x] 2.1 Land `compute-avf-host` on main, together with or after `compute-local-backend` group 1: attach mode, `--job-env-file` (exec test), and `vm/avf-seed`. Verify with `cargo test --lib compute` and the guest test suite.
  - 2026-11-22: merged as azula-cli e4ef3f1. 96 `compute` tests, the guest suites and clippy are clean. Verified on the Pixel 10a: Terminal mode `cloud.sh` ALL PASS, and attach mode (app-hosted AVF VM, no Terminal app, connect-only broker) ALL PASS, both relay-only. The branch and worktree are removed.
- [ ] 2.2 The JNI broker: a new azula-cli crate (`android-host-jni`) that builds an `aarch64-linux-android` `cdylib`, `libazula_host.so`, with the NDK. It exposes `start(configJson)`, `stop()`, `mintGrant(ttl, label)`, `listGrants()` and `revoke(id)` over the `compute` attach-mode broker. Release attaches it, plus `vm/avf-seed/build-seed.sh`'s `seed.iso`, as artifacts the app build consumes. Verify the library loads and serves `compute doctor` from a test app on the Pixel, and that the artifacts attach to a dry-run release.

## 3. The host in azula-app (base APK, `:vmhost`)

- [ ] 3.1 Port the prototype's `HostService`, `Bridge`, `Proxy` and `Splice` to Kotlin, in new `vmhost-api`/`vmhost-real` modules (the api/real convention), running in `:vmhost` with a notification and a Stop action, and calling `libazula_host.so` instead of a child broker. Resolve the hidden API through `HiddenApiBypass`, with a capability check that disables hosting cleanly when it fails. Verify START reaches a reachable worker in under 20 s on the Pixel 10a after the first boot.
- [ ] 3.2 Image management: download `debian-13-generic-arm64.tar.xz`, verify it against `SHA512SUMS`, extract `disk.raw` with an xz decoder, and grow it to 16 GiB. Check free space first, and show progress. Ship `seed.iso` as an app asset. Verify a corrupted download is rejected and retried.
- [ ] 3.3 The one-time grant: an embedded adb client for wireless-debugging pairing (a pairing code entered in a notification, then TLS) that runs `pm grant` for both permissions, with onboarding screens. Detect existing grants, and say which one is missing. Verify on a phone that has never been granted, with no computer attached.
- [ ] 3.4 The grant UI: mint, copy and QR-code a compute grant, list grants, and revoke them, through the JNI broker's `mintGrant`/`listGrants`/`revoke`. Verify a minted token works from the Mac relay-only.
- [ ] 3.5 Find out whether turning Developer options off revokes the grants (design open question). Record the result here and in the onboarding copy.
- [ ] 3.6 The setup flow, exactly as design D9 (approved by Sal 2026-11-22):
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
- [ ] 3.7 Measure setup on the Pixel 10a.
  - **Starting state:** a fresh install under a non-`app.azula` id (e.g. `app.azula.debug`), both VM permissions not granted, Wireless debugging with no paired devices, no computer used for any step. adb stays attached only to record.
  - **Record:** time and deliberate taps from the first "host compute on this phone" to Ready. Measure once with Developer options already on, excluding download time, which is recorded separately. Add the 7-tap Build-number path as a note.
  - **Evidence:** a screen recording (`adb shell screenrecord`) or a screenshot per step, kept with the change. Send the result to Sal with SendUserFile.
  - **Target:** about 2 minutes and about 10 taps. Over that, the flow gets another pass before 4.1.

## 4. Play

- [ ] 4.1 Target API 36 or later, and the Play Console foreground-service declaration with the D8 justification and a demo video. Verify through an internal-testing track upload.
- [ ] 4.2 Review the pre-launch report's non-SDK warnings, and record them.

## 5. Verification

- [ ] 5.1 Run `vm/e2e/cloud.sh` from a Claude Code cloud sandbox (`azula-cli` environment) against the feature build on the Pixel 10a, with the Terminal app not running. Record the timings here.
- [ ] 5.2 Soak overnight, unplugged with the screen off: a job heartbeats every minute. Record gaps, battery drain and thermal status.
- [ ] 5.3 Run the boot and `cloud.sh` matrix on a Pixel 6 or 7 and a Pixel 8 or 9, Android 16 and 17.

## Workflow follow-up

- On archive, fold the delta into `specs/remote-compute/spec.md`, and add an "Android app host" section to `specs/remote-compute/design.md` that links the findings page.
