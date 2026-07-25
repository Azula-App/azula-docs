# Sibling Sync on Resume for iOS and Desktop — Tasks

## 1. Shared prerequisite

- [ ] 1.1 Make each platform's `AzulaState` reachable from platform lifecycle code.
      Today only Android installs it (`AppStateHost.shared`, set in
      `android-app/src/AzulaApplication.kt`); iOS and desktop build theirs inside the
      composition via `rememberAzulaState()` and keep no reference, so
      `AppStateHost.shared` is null there. Decide whether to install into the existing
      `AppStateHost` singleton on all platforms or introduce a cleaner seam, and note the
      reasoning — the singleton is convenient but it is process-global state, and the
      composition-scoped approach was presumably deliberate.

## 2. iOS

- [ ] 2.1 Call `setForeground(true/false)` from the existing `scenePhase` `onChange`
      observer in `ios-app/src/iosApp.swift` (it already fires on `.active` and currently
      only drives `ShareInboxKt.drainShareInbox()`). No new lifecycle plumbing should be
      needed once 1.1 lands.
- [ ] 2.2 Confirm the background direction is also wired (`.inactive`/`.background` →
      `setForeground(false)`), since the fix keys on the false→true *edge* — if false is
      never set, the edge never fires again after the first resume.

## 3. Desktop (`jvm-app`)

- [ ] 3.1 Add a window-focus listener in `jvm-app/src/main.kt` and call `setForeground`
      from it. Compose Desktop exposes window focus state; prefer that over an AWT
      listener if it's available in the version in use.
- [ ] 3.2 Same both-directions check as 2.2.

## 4. Verification

- [ ] 4.1 Unit-test what is testable: the false→true edge reaching `reconnectSiblings`
      on each platform's entry point. Note the existing edge/overlap tests in
      `mock-support/test@jvm/SiblingSyncTest.kt`
      (`foregroundResumeRedialsSiblingsOnlyOnTheFalseToTrueEdge`,
      `rapidResumesDoNotStackConcurrentDialsOntoTheSameSibling`) already cover the
      `ConnectService` side — this task is only about the platform call sites.
- [ ] 4.2 **On-device / on-desktop pass — required, not optional.** Per
      `openspec/specs/testing/design.md` ("the link/0 lesson"), a green `./check` is
      explicitly NOT sufficient evidence for this class of behaviour: the original bug
      was found only by backgrounding a real phone and watching a mailbox see zero
      inbound connections for ~9 minutes. Reproduce that setup: link two devices, put one
      in the background, append an entry on the other, foreground the first, and confirm
      it converges without a force-stop. `AZULA_DATA_DIR` makes a second isolated desktop
      instance safe to run against the real network (see `testing/design.md`).
- [ ] 4.3 `openspec validate --all --strict` green.
