# Sibling Sync on Resume for iOS and Desktop

## Why

`multi-device-identity` shipped in v0.0.6 with a fix (its task 9.6) that re-dials
an identity's sibling devices when the app returns to the foreground. Before it,
`ConnectService.reconnectSiblings()` was reachable only from a transport re-bind
(`transport.onCameOnline`) or the one-shot call at the end of
`ConnectService.start()` — so an app that simply stayed resident never re-synced.
That was confirmed on hardware: backgrounding a phone and returning to it
produced zero sibling dials for ~9 minutes, while a full force-stop and cold
relaunch converged immediately.

**That fix only works on Android.** It landed for free there because
`android-app/src/AzulaApplication.kt` already registered a `ProcessLifecycleOwner`
observer routing foreground transitions into `AppStateHost.shared?.setForeground(...)`.
Neither other platform reaches that path:

- **iOS** — `ios-app/src/iosApp.swift` has a `scenePhase` `onChange` on `.active`,
  but it only drives `ShareInboxKt.drainShareInbox()`. Its `AzulaState` is
  composition-scoped via `rememberAzulaState()` and never installed into
  `AppStateHost`, so `AppStateHost.shared` is null there regardless.
- **Desktop (`jvm-app`)** — no window-focus or foreground listener exists at all
  (`jvm-app/src/main.kt`), with the same composition-scoped state problem.

So on iOS and desktop, sibling sync still fires only on a re-bind or cold start.
Neither is a regression — both behaved this way before the change — but the
multi-device promise is materially weaker there: a resident iPad or laptop
silently drifts from its siblings, and the motivating scenario ("read it on the
laptop and the phone's badge clears") does not hold in the direction that ends at
those devices.

## What Changes

- Install each platform's `AzulaState` into `AppStateHost` (or an equivalent
  seam) so a foreground signal can reach it. This is the shared prerequisite;
  today both platforms build their state inside the composition and drop the
  reference.
- **iOS**: call `setForeground` from the existing `scenePhase` observer, which
  already fires on `.active` — no new lifecycle plumbing needed once the state is
  reachable.
- **Desktop**: add a window-focus listener in `jvm-app` and call `setForeground`
  from it.
- No change to `ConnectService`: the false→true edge guard and the
  `siblingDialsInFlight` overlap guard added by `multi-device-identity` task 9.6
  already do the right thing once `setForeground` is actually called. This change
  is about *reaching* that code on two more platforms.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `account-sync`: the sibling discovery/dial behaviour is unchanged in substance,
  but its per-platform reachability should be stated rather than left implicit —
  a requirement that resuming a backgrounded device re-dials its siblings on
  every platform that has a foreground signal.

## Impact

- **azula-app**: `ios-app/src/iosApp.swift`, `jvm-app/src/main.kt`, and whatever
  seam is chosen for installing `AzulaState` into `AppStateHost` (today
  `android-app/src/AzulaApplication.kt` is the only caller of
  `AppStateHost.shared`).
- **Verification**: per `openspec/specs/testing/design.md` ("the link/0 lesson"),
  this class of behaviour cannot be evidenced by a green `./check` — it needs an
  on-device / on-desktop pass. The `multi-device-identity` change's
  `9.3-9.4-runbook.md` (archived with it) has the working three-endpoint setup,
  and `AZULA_DATA_DIR` now makes a second isolated desktop instance safe to run.
