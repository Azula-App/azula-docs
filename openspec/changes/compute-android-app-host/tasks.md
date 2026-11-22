The reference prototype is azula-cli branch `compute-avf-host`. It
contains:
- `vm/android-host`, the Java app;
- `vm/avf-seed`, the seed;
- attach mode in `src/compute/local.rs`;
- `azula-guest --job-env-file`.

It passed `vm/e2e/cloud.sh` relay-only on a Pixel 10a on 2026-11-22. Group 1
must finish before groups 2–4. Group 5 needs groups 1–4.

## 1. Feasibility in azula-app

- [ ] 1.1 Spike: can Amper build an Android App Bundle with an on-demand dynamic feature module? It must carry a native library that is extracted and exec-able from the split, plus a service in a `:vmhost` process. Verify with `bundletool build-apks --local-testing`, install on the Pixel under a non-`app.azula` id, and exec the split's `libazula.so`. If Amper can't, record the Gradle shell fallback here and get Sal's choice on an AskUserQuestion card.
- [ ] 1.2 Base manifest additions: the two VM permissions, `FOREGROUND_SERVICE_SPECIAL_USE`, and the `specialUse` service with `PROPERTY_SPECIAL_USE_FGS_SUBTYPE` (justification text in design D8). Verify with `aapt2 dump xmltree` on the base APK.

## 2. azula-cli

- [ ] 2.1 Land `compute-avf-host` on main, together with or after `compute-local-backend` group 1: attach mode, `--job-env-file` (exec test), and `vm/avf-seed`. Verify with `cargo test --lib compute` and the guest test suite.
- [ ] 2.2 Release: build the static `aarch64-unknown-linux-musl` broker, `vm/android-host/build-broker.sh`, plus `vm/avf-seed/build-seed.sh`, as release artifacts the app build consumes. Verify the artifacts are attached to a dry-run release.

## 3. The host feature (azula-app)

- [ ] 3.1 Port the prototype's `HostService`, `Bridge`, `Proxy`, `Broker` and `Splice` to the feature in Kotlin, running in `:vmhost` with a notification and a Stop action. Resolve the hidden API through `HiddenApiBypass`, with a capability check that disables hosting cleanly when it fails. Verify START reaches a reachable worker in under 20 s on the Pixel 10a after the first boot.
- [ ] 3.2 Image management: download `debian-13-generic-arm64.tar.xz`, verify it against `SHA512SUMS`, extract `disk.raw` with an xz decoder, and grow it to 16 GiB. Check free space first, and show progress. Ship `seed.iso` as a feature asset. Verify a corrupted download is rejected and retried.
- [ ] 3.3 The one-time grant: an embedded adb client for wireless-debugging pairing (a pairing code entered in a notification, then TLS) that runs `pm grant` for both permissions, with onboarding screens. Detect existing grants, and say which one is missing. Verify on a phone that has never been granted, with no computer attached.
- [ ] 3.4 The grant UI: mint, copy and QR-code a compute grant, list grants, and revoke them, through the broker's CLI verbs in app storage. Verify a minted token works from the Mac relay-only.
- [ ] 3.5 Find out whether turning Developer options off revokes the grants (design open question). Record the result here and in the onboarding copy.

## 4. Play

- [ ] 4.1 Target API 36 or later, and the Play Console foreground-service declaration with the D8 justification and a demo video. Verify through an internal-testing track upload.
- [ ] 4.2 Review the pre-launch report's non-SDK warnings, and record them.

## 5. Verification

- [ ] 5.1 Run `vm/e2e/cloud.sh` from a Claude Code cloud sandbox (`azula-cli` environment) against the feature build on the Pixel 10a, with the Terminal app not running. Record the timings here.
- [ ] 5.2 Soak overnight, unplugged with the screen off: a job heartbeats every minute. Record gaps, battery drain and thermal status.
- [ ] 5.3 Run the boot and `cloud.sh` matrix on a Pixel 6 or 7 and a Pixel 8 or 9, Android 16 and 17.

## Workflow follow-up

- On archive, fold the delta into `specs/remote-compute/spec.md`, and add an "Android app host" section to `specs/remote-compute/design.md` that links the findings page.
