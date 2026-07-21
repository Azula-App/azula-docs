## Context

Android release builds had no working iroh FFI. R8 renamed
`com.sun.jna.Pointer.peer` to `d`; JNA resolves that field from native code by
its literal name, so `Native.initIDs()` threw `UnsatisfiedLinkError`, its static
initializer never recovered, and every later `Structure` allocation threw
`NoClassDefFoundError: com.sun.jna.Native`. Debug builds are unaffected because
they are not minified — which is why the whole class of failure was invisible
locally and in tests.

Three separate weaknesses had to line up:

- Nothing kept JNA safe from R8, and no consumer could add rules: Amper exposes
  no proguard/R8 config surface (`android-app/module.yaml` already documents
  hitting this wall with Tink's annotation deps), and the upstream `jna` AAR
  ships no `proguard.txt`.
- `ConnectService.start()` wrapped its bind in `try/catch → offline = true`, but
  the structurally identical re-bind inside `importSecretKey` was unwrapped, all
  the way up through `importRecoveryPhrase` to a `rememberCoroutineScope().launch`
  with no `CoroutineExceptionHandler`. So the same fault degraded gracefully at
  startup and killed the process on restore.
- Tests could not have caught the restore path: `FakeTransport.importSecretKey`
  is a no-op, so every existing restore test ran against a transport that can
  neither fail nor actually re-bind.

Diagnosis was also slowed by documentation drift: the specs said azula-app
consumes the SDK from `mavenLocal`, so a locally rebuilt SDK looked like it
should fix the app. It does not — Amper resolves from Maven Central only.

## Goals / Non-Goals

**Goals:**
- Release builds keep a working FFI layer, provably (endpoint binds and the app
  reaches online — not merely "does not crash").
- No transport fault can turn a restore into a process kill.
- A restore leaves the app fully functional, inbound included.
- The documented SDK consumption model matches reality.

**Non-Goals:**
- Moving off JNA to a pure-JNI Gobley backend. That would remove the root cause
  class entirely but is a much larger change to the SDK.
- Revisiting the open `recovery-restore-ux` questions (second confirmation,
  archiving the old key, `reconnectSaved()` scoping). Untouched here.
- Adding a general R8 configuration surface to Amper builds.

## Decisions

**Keep rules ship in the SDK's AAR, not the app.** `consumerProguardFiles`
embeds `consumer-rules.pro` in the `-android` AAR, and R8 applies it to every
consumer automatically. Alternatives rejected: app-side rules (impossible —
Amper offers no config surface); disabling minification for release (throws away
shrinking and obfuscation across the whole app to work around one library);
patching the upstream `jna` AAR (not ours). The SDK is what forces the JNA
dependency, so it is the correct owner of the constraint.

**The rules keep JNA broadly but stay scoped.** `-keep class com.sun.jna.** { *; }`
retains members, not just class names, because the breakage is a *field* rename;
class-only keeps would not have helped. `Structure` subclasses, `Library`/
`Callback` implementors, and `app.azula.iroh.**` are kept because JNA reads
Structure fields positionally by name, and `Library` method names *are* the
native symbol names. Verified this stays targeted: the app's own
`peerCode`/`peerStore` fields are still obfuscated in the release mapping.

**Restore reports success when only the re-bind fails.** `importSecretKey`
persists the key before re-binding, so the identity has already changed; the
node comes up on the next bind. Returning failure would surface "that isn't a
valid recovery phrase" for a phrase that decoded and committed — actively
misleading. Degrading to `offline` matches what a failed initial bind already
does. `CancellationException` is rethrown so structured concurrency still works.

**The accept loop restarts on `onCameOnline`, gated on a `bound` flag.**
`incoming()` binds to whichever endpoint was current when it was collected, so a
re-bind strands the collector; the torn-down endpoint reports a clean close and
the flow simply completes. Restarting it unconditionally from `onCameOnline` was
rejected: the test fakes' `bind` is `= Unit` and never invokes that callback, so
they would silently lose their accept loop. The flag restarts only on re-binds
and leaves first-bind wiring to `start()`.

**`start()` is guarded by a `Mutex`, not a boolean.** Its two callers arrive on
different dispatchers (Android's `Application` on `Dispatchers.Default`, the
composition's `SetupGate` on Main), so a bare flag is racy.

## Risks / Trade-offs

- **`-keep class app.azula.iroh.** { *; }` is broad** → It disables shrinking for
  the binding package. Accepted: it is a thin FFI shim with little to shrink, and
  the cost of a too-narrow rule is another release-only, build-silent breakage.
- **Keep rules only take effect once a new SDK version is published** → Central
  versions are immutable, so the fix cannot reach the app by republishing the
  existing version. Requires a version bump plus coordinate bumps in two
  module.yaml files.
- **This class of bug is invisible to the build and to tests** → Mitigated by
  asserting on the release `mapping.txt` and by an on-device check that the app
  reaches *online*, not merely that it does not crash.
- **Restore reporting success while offline could read as a silent failure** →
  The app's existing connect UI already surfaces offline state; the alternative
  (claiming the phrase was invalid) is worse.

## Migration Plan

1. Publish the new SDK `VERSION_NAME` to Maven Central (tag-driven CI).
2. Bump the coordinate in `azula-app/network-real/module.yaml` (two entries) and
   `azula-app/android-app/module.yaml`.
3. Rebuild the release and confirm on-device: no crash on restore, and the home
   screen reports online with a live peer code.

Rollback: revert the coordinate bump. The app-side guards are independent of the
SDK version and can stay regardless.

## Open Questions

- **When does the upstream Gobley fix land, and how much of `consumer-rules.pro`
  can then be dropped?** Gobley 0.3.7 already generates the right JNA rules and
  enables them by default, but wires them into `buildType.proguardFiles` — the
  library's own minification — and never into `consumerProguardFiles`, so no
  consumer ever sees them. Our file is a local patch for that gap, and is
  deliberately wider than Gobley's (subpackages, non-public `Structure` members,
  and the generated binding package, whose `Library` method names are the `dlsym`
  symbols). Written up with a minimal replication in
  `iroh-kmp/docs/gobley-consumer-proguard-gap.md`.
  (An earlier draft asked whether to move to "Gobley's JNI backend" — 0.3.7 has
  no such backend, and JNI would only reduce the risk anyway, since R8's defaults
  keep native *method* names but nothing keeps fields.)
- Should CI assert on the release `mapping.txt` (or run a smoke test on a
  minified build) so a future keep-rule regression fails the build rather than
  reaching a device? The `mapping.txt` grep is a cheap, device-free assertion.
