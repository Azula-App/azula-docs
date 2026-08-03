## Why

Every Android **release** build shipped with no working iroh networking at all,
and the only visible symptom was an unrelated-looking crash.

R8 renames `com.sun.jna.Pointer.peer`. JNA resolves that field from native code
by its literal name (`GetFieldID`), so `Native.initIDs()` threw
`UnsatisfiedLinkError`, JNA's static initializer never recovered, and every
subsequent `Structure` allocation threw `NoClassDefFoundError: com.sun.jna.Native`
— i.e. the entire FFI layer, release-only, with no build-time signal. The startup
bind hit this first and swallowed it (`catch { offline = true }`), so the app
looked merely offline. Recovery-phrase restore was the first **unguarded** FFI
call, so that is where it surfaced, as a process kill.

Three things had to be true at once for this to reach a user, and each is worth
fixing on its own:

1. Nothing protected JNA from R8, and no consumer *could* protect it — Amper
   exposes no proguard/R8 config surface, and the upstream `jna` AAR ships no
   consumer rules.
2. The restore path propagated transport failures into a UI coroutine with no
   exception handler, turning any transport fault into a crash — while the
   structurally identical startup bind degraded gracefully.
3. `openspec/specs/iroh-kmp/spec.md` still described azula-app as consuming the
   SDK from `mavenLocal`. It does not: Amper resolves from Maven Central and
   never reads `~/.m2`. That drift is why a locally rebuilt SDK appeared to
   change nothing, and why the broken artifact stayed broken.

## What Changes

- The `-android` AAR ships `consumer-rules.pro` (via `consumerProguardFiles`),
  keeping JNA's classes/members, `Structure` subclasses, `Library`/`Callback`
  implementors, and the generated `app.azula.iroh.**` surface. Consumers get the
  rules automatically because they cannot supply their own.
- Correct the documented consumption model: azula-app depends on a
  **Maven-Central-published version**, not `mavenLocal`. Because Central versions
  are immutable, landing an SDK change means publishing a *new* `VERSION_NAME`
  and bumping the coordinate in `network-real/module.yaml` (two entries) and
  `android-app/module.yaml`.
- Restore no longer propagates a failed re-bind. It degrades to offline exactly
  as the initial bind does, and still reports success — `importSecretKey`
  persists the key *before* re-binding, so the restore did commit and the
  identity comes up on the next bind. Reporting failure would show "that isn't a
  valid recovery phrase" about a phrase that decoded fine.
- Restore leaves the transport fully functional. The inbound accept loop is
  re-established against the new endpoint; previously it stayed bound to the
  torn-down one, which reports a clean close, so the app accepted **no** inbound
  connection until relaunch.
- `AzulaState.start()` is idempotent. Android calls it twice (Application, then
  the composition's `SetupGate`); only the gate decision was guarded, so a second
  endpoint was bound on the same secret key — two endpoints sharing one endpoint id, the
  first orphaned along with its accept loop.

Not breaking: no public API changes. The SDK version bump is a normal release.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `iroh-kmp`: consumption is from Maven Central by published version, not
  `mavenLocal` (corrects an inaccurate requirement); and the `-android` AAR SHALL
  ship R8 consumer keep rules so consuming release builds keep a working FFI.
- `identity`: the Restore Flow requirement gains failure behavior it never
  specified — a failed re-bind SHALL degrade to offline rather than propagate,
  and a successful restore SHALL leave the transport able to accept inbound
  connections without a relaunch.
- `onboarding`: the setup gate's "decided exactly once" guarantee extends to the
  whole start sequence — `start()` SHALL be idempotent, binding at most one
  endpoint however many times it is called.

## Impact

- `iroh-kmp/consumer-rules.pro` (new), `iroh-kmp/build.gradle.kts`
  (`consumerProguardFiles`), `iroh-kmp/gradle.properties` (`VERSION_NAME`).
- `azula-app/shared/src/dev/azula/state/ConnectService.kt` (restore guard,
  `startIncomingLoop()`), `azula-app/shared/src/dev/azula/state/AzulaState.kt`
  (idempotent `start()`).
- `azula-app/network-real/module.yaml`, `azula-app/android-app/module.yaml` —
  SDK coordinate bump once the new version is published.
- Docs already corrected: `openspec/project.md` and
  `openspec/specs/iroh-kmp/design.md` (consumption model + why the keep rules
  ship with the AAR).
- Release: the fix only reaches an app build after the new SDK version is
  published to Maven Central; until then release builds keep the broken artifact.
