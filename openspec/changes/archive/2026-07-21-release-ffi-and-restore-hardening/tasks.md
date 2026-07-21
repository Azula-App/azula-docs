## 1. SDK keep rules (iroh-kmp)

- [x] 1.1 Add `consumer-rules.pro` keeping JNA classes+members, `Structure`
      subclasses, `Library`/`Callback` implementors, and `app.azula.iroh.**`
- [x] 1.2 Wire it via `consumerProguardFiles("consumer-rules.pro")` in the
      `defaultConfig` block of `build.gradle.kts`
- [x] 1.3 Bump `VERSION_NAME` in `gradle.properties` (Central versions are
      immutable, so a new version is required)
- [x] 1.4 Confirm the published `-android` AAR contains `proguard.txt`

## 2. App-side hardening (azula-app)

- [x] 2.1 `ConnectService.importRecoveryPhrase`: catch a failed re-bind, degrade
      to `offline`, still report success; rethrow `CancellationException`
- [x] 2.2 Extract `ConnectService.startIncomingLoop()` and re-run it from
      `onCameOnline`, gated on a `bound` flag so first-bind wiring and the test
      fakes (whose `bind` never invokes the callback) are unaffected
- [x] 2.3 Make `AzulaState.start()` idempotent behind a `Mutex`

## 3. Regression coverage

- [x] 3.1 Test: a transport that fails to re-bind does not propagate out of
      restore
- [x] 3.2 Test: `start()` called twice binds exactly once
- [x] 3.3 Test: inbound is still accepted after a restore re-bind
- [x] 3.4 Confirm the new tests fail with the fixes removed (not vacuous)

## 4. Documentation

- [x] 4.1 Correct `openspec/project.md`: consumption is from Maven Central;
      `publishToMavenLocal` does not feed azula-app; record the actual procedure
- [x] 4.2 Correct `openspec/specs/iroh-kmp/design.md`: consumption model, the
      real module paths, and why the keep rules ship with the AAR

## 5. Land it in a shipped build

- [x] 5.1 Publish the new SDK version to Maven Central (tag-driven CI) —
      `v0.1.1`, and the published AAR carries `proguard.txt`
- [x] 5.2 Bump the coordinate in `azula-app/network-real/module.yaml` (two
      entries) and `azula-app/android-app/module.yaml`
- [x] 5.3 Rebuild the Android release and confirm `mapping.txt` leaves
      `com.sun.jna.Pointer`'s fields unrenamed — verified with `~/.m2`'s copy
      moved aside, so the build provably resolved from Central; R8 still
      renames the app's own `peerCode`/`peerStore`, confirming scoped rules
- [x] 5.4 On-device check (Pixel 10a): no crash, `logcat -b crash` empty, home
      screen online with peer code `4d · fox · onyx` — the code derives from the
      restored key, so the match proves the identity was applied, not re-minted.
      Restore-from-Settings exercised directly afterwards, also clean

## 6. Follow-ups

- [ ] 6.1 Decide whether CI should assert on the release `mapping.txt` (or smoke
      test a minified build) so a keep-rule regression fails the build instead
      of reaching a device
- [ ] 6.2 Decide whether to move the SDK to Gobley's JNI backend, removing JNA
      and this failure class from the Android path
