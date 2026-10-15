# Sibling Sync on Resume for iOS and Desktop — Tasks

## 1. Shared prerequisite

- [x] 1.1 Make each platform's `AzulaState` reachable from platform lifecycle code.
      Today only Android installs it (`AppStateHost.shared`, set in
      `android-app/src/AzulaApplication.kt`); iOS and desktop build theirs inside the
      composition via `rememberAzulaState()` and keep no reference, so
      `AppStateHost.shared` is null there. Decide whether to install into the existing
      `AppStateHost` singleton on all platforms or introduce a cleaner seam, and note the
      reasoning — the singleton is convenient but it is process-global state, and the
      composition-scoped approach was presumably deliberate.
      **Decided: a bus, not `AppStateHost`.** `shared/src/dev/azula/state/ForegroundBus.kt`
      (common code) follows the existing iOS seams `DeepLinkBus`/`InviteBus`/`ShareBus`:
      `AzulaState.init` registers `setForeground` as its handler, and the platform calls
      the top-level `setAppForeground(foreground)`. It buffers only the latest value until
      a state registers. Not `AppStateHost`, because the composition-scoped state's
      coroutine scope is `rememberCoroutineScope()`, which dies with the composition, and
      `rememberAzulaState()` returns `AppStateHost.shared` before building anything, so
      publishing a composition-scoped state there would hand a recreated composition a
      state whose scope is already cancelled. Desktop can use the same entry point from
      `jvm-app/src/main.kt`, outside `App()`.

## 2. iOS

- [x] 2.1 Call `setForeground(true/false)` from the existing `scenePhase` `onChange`
      observer in `ios-app/src/iosApp.swift` (it already fires on `.active` and currently
      only drives `ShareInboxKt.drainShareInbox()`). No new lifecycle plumbing should be
      needed once 1.1 lands.
      `.active` and `.inactive` → `ForegroundBusKt.setAppForeground(foreground: true)`,
      `.background` → `false`.
- [x] 2.2 Confirm the background direction is also wired (`.inactive`/`.background` →
      `setForeground(false)`), since the fix keys on the false→true *edge* — if false is
      never set, the edge never fires again after the first resume.
      Wired on `.background` only. `.inactive` deliberately counts as **foreground**:
      Apple defines it as foreground-but-not-receiving-events, and the app is still on
      screen in every case that produces it (Control Center or Notification Center pulled
      over it, an incoming-call banner, a system alert, the app switcher). Treating it as
      background would post notifications for a conversation the user can see. It is also
      the first phase delivered on the way back from `.background`, so the resume edge
      fires at the first scene callback after the process thaws. Every path to
      `.background` passes through `.inactive` and ends at `.background`, so false is
      always set on the way down.
      Since iOS now actually lowers `inForeground`, `IosNotifier` can post on iOS for the
      first time: before this, `FrameDispatcher.notify` and `InviteService` always saw
      the default `true` and returned early, so 0.0.7's background-notification fix was
      Android-only in practice. Simulator findings (iPhone 17 Pro, iOS 26.5), with the
      wiring confirmed by logging `ForegroundBus.deliver`: the app is suspended about
      0.2 s after `.background`, so a post only lands if the process is still awake; a
      post made at the `.background` callback itself is still treated by iOS as a
      foreground presentation and dropped (the app delegate implements no `willPresent`);
      a post made while truly backgrounded raises the first-run permission prompt over
      whichever app is frontmost and holds the notification until the user answers.
      Work queued before suspension runs on thaw *before* the `.inactive` callback.

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
      iOS: `iosForegroundEntryPointReachesTheStateAndRedialsOnResume` drives
      `setAppForeground` (the entry point Swift calls) through `ForegroundBus` to the
      live state. The Swift `scenePhase` switch itself has no unit test. Desktop: open
      with 3.1.
- [ ] 4.2 **On-device / on-desktop pass — required, not optional.** Per
      `openspec/specs/testing/design.md` ("the link/0 lesson"), a green `./check` is
      explicitly NOT sufficient evidence for this class of behaviour: the original bug
      was found only by backgrounding a real phone and watching a mailbox see zero
      inbound connections for ~9 minutes. Reproduce that setup: link two devices, put one
      in the background, append an entry on the other, foreground the first, and confirm
      it converges without a force-stop. `AZULA_DATA_DIR` makes a second isolated desktop
      instance safe to run against the real network (see `testing/design.md`).
- [ ] 4.3 `openspec validate --all --strict` green.
