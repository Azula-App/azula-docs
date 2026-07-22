# azula onboarding — the first-run setup flow

What gates a fresh install behind a setup flow before the main app, why the
gate reads a pre-bind key-store probe instead of trusting a flag or the key
store alone, and how the flow reuses the `identity` capability's export/
restore seams rather than inventing new ones. Companion to
[`identity.md`](../identity/design.md); the flow's own requirements live in
the `onboarding` capability spec.

## What triggers setup, and what doesn't

`AzulaApp()` (`shared/src/dev/azula/App.kt`) unconditionally builds
`AzulaState` and starts the transport. There was no first-run signal
anywhere in the repo before this: keygen happens silently, eagerly, inside
`transport.bind(...)` the moment the platform key store has nothing saved
(`ConnectService.start()`), so by the time any code could ask "is this a
fresh install?" the answer is already destroyed — a key now exists whether
the user is one screen into onboarding or ten runs deep into normal use.

Two candidate gate signals were considered and both fail alone:

- **Key existence alone** breaks resume. A user who quits at the identity
  fork already has a persisted key (keygen already ran at bind), so a
  key-only check would never show setup again on relaunch — but the spec
  requires setup to resume until it's actually completed.
- **An app-level flag alone** breaks upgrades. Every install that predates
  this flow has a key but no flag, and would wrongly see setup on its next
  launch.

So the gate is a flag with a one-shot disambiguation for the flag's absence,
evaluated as a three-way decision:

- flag set → open the main app.
- flag unset, a key already exists → this is a pre-existing install
  upgrading past a version without setup, not a fresh install: silently
  write `setupCompleted = true` and open the main app. No setup is shown.
- flag unset, no key exists → fresh install: show the setup flow.

The "does a key exist" half is `IrohTransport.hasPersistedIdentity(): Boolean`
(`network-api/src/dev/azula/net/IrohTransport.kt`) — a **pre-bind** read of
the platform key store, called before `state.start()` for exactly this
reason: `bind()` persists a key as a side effect, so probing after bind would
always see "yes." `IrohFfiTransport` (JVM/Android,
`network-real/src@jvmAndAndroid/dev/azula/net/IrohFfiTransport.kt`) implements
it as `keyStore.load() != null`; `IrohTransport.ios.kt`
(`network-real/src@ios/...`) does the same against the Keychain. Both treat a
read failure (e.g. a locked macOS Keychain throwing
`KeychainUnavailableException`) as "no identity" rather than propagating the
exception — see Risks below. `FakeTransport` (`mock-support`) defaults the
value to `true`, which is what makes `-mock` apps skip setup for free with no
special-casing anywhere else, while still letting tests construct a fake with
`hasPersistedIdentity = false` to force the flow on.

The alternative of deriving "fresh" purely from `SettingsStore.load() ==
null` was rejected: a user who has a key and simply has never touched a
setting is indistinguishable, under that scheme, from a fresh install — it
would re-show setup to real users. `hasPersistedIdentity()` is the one place
network-real internals leak through the `IrohTransport` interface for a
UI-gating purpose rather than a networking one, which is the trade made to
avoid that false positive.

## `start()` still runs immediately — setup isn't a pre-boot detour

Showing setup does not delay `state.start()`. The transport binds exactly as
it does today, concurrently with the setup UI:

- The back-up step needs `exportRecoveryPhrase()`, which requires a bound
  transport regardless — deferring bind until the fork is resolved would just
  move the binding latency into the back-up step instead of hiding it behind
  the fork screen.
- "Create a new identity" then does no work of its own — the key already
  exists by the time the user reaches it, so the step just advances.
- "I have a recovery phrase" reuses `importRecoveryPhrase()`
  (`ConnectService.kt`) completely unchanged: the eagerly-generated key
  created at bind is a throwaway, and restore's existing
  persist-then-rebind-in-place behavior overwrites it exactly the way it
  overwrites any other key on a restore from Settings. No pre-bind import
  path needed to be invented.

The rejected alternative — delay bind until the fork resolves, then import
the restored key before ever binding — would have needed a new pre-bind
import seam in `network-real` and a change to `ConnectService`'s boot
ordering, for no user-visible difference in behavior.

## Where the gate lives: a wrapper in `App.kt`, not new `AzulaState` surface

The gate is a composable wrapper (`SetupGate`) around the existing
`BoxWithConstraints` body of `AzulaApp()`: it evaluates the three-way
decision above, shows `SetupFlow` until setup completes, and then falls
through to the untouched `DesktopApp`/`MobileApp` trees. The `state.start()`
`LaunchedEffect` that used to live inside `rememberAzulaState()`
(`shared/src/dev/azula/state/AppEntry.kt`) moves into the gate, so the gate
can call `hasPersistedIdentity()` first and start the transport immediately
afterward on both branches (main-app path and setup path alike).

Setup's own step position — `FORK → RESTORE? → BACKUP → PERSONA` — is a
small local state machine private to the setup UI (`shared/src/dev/azula/
ui/setup/`), not new state on `AzulaState`. Neither of the app's two existing
navigation schemes fits a pre-app flow (mobile's `MScreen` enum and desktop's
`desktopActive` string both describe screens *within* the main app), and
growing the shared coordinator to model a one-time, linear, four-step flow
would outlive its usefulness the moment setup completes. The gate reads
`AzulaState` (for `exportRecoveryPhrase`/`importRecoveryPhrase`/
`upsertPersona` and the settings flags) but does not add to it.

## Two presentations, one breakpoint

`SetupFlow` runs its own `BoxWithConstraints` rather than sharing the app's,
but at the same `maxWidth >= 820.dp` cut line `App.kt` already uses (the
`e2e/README.md` "no tablet tier" rule applies here too — this is not a third
breakpoint):

- **≥ 820dp — direction 1c, the step rail.** A rail column (identity / back
  up / persona / done, each rendered completed/current/pending) beside a
  content pane holding the current step.
- **< 820dp — direction 1a, stepped cards.** A full-screen card per step with
  progress dots indicating position in the flow.

Both blueprints are directions of `Setup flow.dc.html` in the Claude Design
setup-flow project (`0598a0ab-…`). The step *content* — fork cards, the word
grid, the persona form — is a set of composables shared between both shells;
only the surrounding chrome (rail vs. card-with-dots) differs. The word grid
itself has its own internal breakpoint independent of the shell: 2 columns on
compact width, 3 on wide, per the blueprints. All visual values (color,
spacing, type, glow) come from the existing tokens in
[`design-system.md`](../design-system/design.md) — onboarding introduces no
new tokens.

## Reusing the identity capability's seams, not duplicating them

Every step delegates to a seam that already exists for Settings' export/
restore/persona flows (see [`identity.md`](../identity/design.md)):

- **Back-up step.** Words come from `state.exportRecoveryPhrase()` — while it
  returns `null` (bind still in flight, or offline) the step shows a waiting
  state rather than a phrase, so nothing is fabricated. Copy uses the same
  clipboard seam `RevealPhraseDialog` uses in Settings.

  "Save to password manager" goes through the `PhraseSaver` expect/actual
  (`shared/src/dev/azula/ui/PhraseSaver.kt`), which mirrors `FilePicker`'s
  `staticCompositionLocalOf` test seam — the platform sheet is a native modal,
  so a UI test that tapped the button would otherwise block forever. Per
  platform:

  - **Android** — `CredentialManager.createCredential` with a
    `CreatePasswordRequest`, i.e. the real OS save sheet backed by the user's
    installed provider. The `credentials-play-services-auth` artifact is what
    routes this on API < 34.
  - **iOS** — the share sheet. There is no public API to add an item to the
    user's password manager programmatically: AutoFill's "Save Password"
    prompt is driven by the system observing a real password field, and
    `SecAddSharedWebCredential` has been deprecated since iOS 14.
  - **Desktop JVM** — reports unavailable, so it falls back to Copy.

  The action reports three distinct outcomes — saved, cancelled, unavailable —
  and only *unavailable* falls back to the clipboard. Cancelling means the user
  declined to store the phrase, so copying it anyway would put the identity key
  somewhere they didn't ask for; and the fallback label says "copied instead",
  never "saved", since claiming a vault save that didn't happen would leave the
  user believing the identity key is backed up when it isn't. Copy and save
  carry independent feedback: `state.copied` is a single app-wide flash shared
  with Settings/Connect/Sidebar, so hanging both off it made tapping one light
  up the other.

  Continue is disabled until the user checks "I've saved my recovery
  phrase"; "back up later" skips that gate entirely and advances
  immediately.
- **Restore step.** Same validate-then-commit path as `RestorePhraseDialog`:
  `state.importRecoveryPhrase()`, decode failure (wrong word count, unknown
  word, bad checksum) shows an inline error and changes nothing, success
  commits the restored identity in place and skips straight to the persona
  step (backup makes no sense for an identity that already has its own
  phrase). If `recovery-restore-ux` later adds confirmation semantics to
  restore, this step inherits them automatically, since it's the same call.
- **Persona step.** A first-run-slimmed variant of the `PersonaEditor` form
  (name, optional bio, optional avatar), writing through
  `state.upsertPersona`. `PersonaService`'s existing
  auto-default-on-first-persona behavior makes whatever is created here the
  default persona with no onboarding-specific code. "Skip for now" writes
  nothing at all.
- **Completion.** Reaching "done" (finish or skip of the persona step) writes
  `setupCompleted = true` to `AppSettings`, plus `backupDeferred = true` iff
  "back up later" was chosen on the back-up step. Both are ordinary
  `SettingsStore`-blob fields
  (`persistence-api/src/dev/azula/persist/SettingsStore.kt`), alongside
  `terminalSmartInput` — the existing "small app-level flags live here"
  pattern, not a new store.

## Risks / edge cases

- **Offline on first launch.** If bind never completes, the back-up step's
  waiting state persists indefinitely, but "back up later" is always
  available regardless, and the phrase is reachable afterward via Settings'
  reveal flow once the transport does come online. No key is fabricated to
  paper over the wait.
- **Keychain unreadable, not just empty.** `hasPersistedIdentity()` cannot
  distinguish "no key was ever saved" from "the store exists but couldn't be
  read" (macOS Keychain locked, surfaced as `KeychainUnavailableException`).
  Both read as "no identity," so worst case an existing user with a
  momentarily-unreadable Keychain sees setup once. This is harmless:
  choosing "create" falls back to the same keystore-recovery behavior bind
  already has today, and restore is still available if they have their
  phrase.
- **Restore commits without a confirmation step**, exactly like Settings'
  restore dialog does today — intentional, not an oversight of this change.
  Whatever `recovery-restore-ux` decides about restore confirmation applies
  to both places at once, since setup's restore step and Settings' restore
  dialog are the same call.
