# Initial Setup Flow — Design

## Context

Today `AzulaApp()` (`azula-app/shared/src/dev/azula/App.kt`) builds
`AzulaState` via `rememberAzulaState()` (`shared/src/dev/azula/state/AppEntry.kt`),
which unconditionally runs `state.start()` in a `LaunchedEffect`;
`ConnectService.start()` then calls `transport.bind(...)`, and keygen happens
eagerly inside bind on the Rust side when the platform `SecretKeyStore` has
nothing saved. There is no first-run or onboarding logic anywhere in the
repo, and no pre-bind "does a key exist" query on the `IrohTransport`
interface.

Existing seams this change builds on:

- `RecoveryPhrase.encode/decode` (`core/src/dev/azula/core/RecoveryPhrase.kt`).
- `AzulaState.exportRecoveryPhrase()` / `importRecoveryPhrase()` →
  `ConnectService` (`shared/src/dev/azula/state/ConnectService.kt`) — export
  returns null until the transport binds; import decodes, persists, and
  rebinds in place.
- Persona CRUD + default-persona in `PersonaService`
  (`shared/src/dev/azula/state/PersonaService.kt`); first created persona
  auto-becomes the default. `PersonaEditor` dialog in
  `shared/src/dev/azula/ui/Settings.kt` is the existing editing UI.
- `AppSettings`/`SettingsStore`
  (`persistence-api/src/dev/azula/persist/SettingsStore.kt`) — the
  documented home for small app-level flags; `load()` returning null is the
  existing "fresh install" idiom.
- The app's only form-factor branch: `BoxWithConstraints` +
  `maxWidth >= 820.dp` → `DesktopApp` else `MobileApp` (`App.kt`). No
  navigation library; both trees are hand-rolled.

Visual blueprints: `Setup flow.dc.html` in the Claude Design setup-flow
project (`0598a0ab-…`) — direction 1c (desktop step rail) + 1a (mobile
stepped cards). All values come from existing design-system tokens.

## Goals / Non-Goals

**Goals:**

- Gate fresh installs behind the setup flow (fork → back up → persona →
  done) without changing how or when keys are actually created.
- Reuse the existing export/restore/persona seams — no new crypto, no new
  storage mechanisms.
- Make the flow testable at the state layer and in the JVM Compose harness
  without new scaffolding.

**Non-Goals:**

- No backup-reminder UI for deferred backups (this change only records
  `backupDeferred`; a Settings nudge is a follow-up).
- No change to keygen mechanics, key storage, or the restore-in-place
  semantics (`recovery-restore-ux` owns any changes there).
- No third layout tier — the existing 820dp breakpoint stands
  (`e2e/README.md` explicitly warns against a tablet tier).
- No CLI/site/iroh-kmp changes.

## Decisions

### D1: Gate on `AppSettings.setupCompleted`, with a one-shot upgrade check

Two candidate gate signals existed: (a) "no persisted key" via the key
store, (b) an app-level flag. Neither alone is sufficient:

- Key-existence alone breaks resume: keygen is eager at bind, so a user who
  quits at the fork screen already has a persisted key, and the flow would
  never reappear (spec requires resume-on-relaunch).
- The flag alone breaks upgrades: existing installs have a key but no flag
  and would wrongly see setup.

So: the gate shows setup iff `AppSettings.setupCompleted != true`, and a new
`IrohTransport.hasPersistedIdentity(): Boolean` disambiguates the flag's
absence exactly once — evaluated **before** `state.start()` (bind would
persist a key and destroy the signal):

- flag set → main app.
- flag unset, key exists → pre-existing install upgrading: silently write
  `setupCompleted = true`, main app.
- flag unset, no key → fresh install: setup flow.

`hasPersistedIdentity()` is a pre-bind read of the platform `SecretKeyStore`
(`keyStore.load() != null`) on JVM/Android, the Keychain probe on iOS.
`FakeTransport` returns a constructor-controllable value defaulting to
`true`, which makes `-mock` apps skip setup for free and lets tests force it
on. This is the one place network-real internals surface through the
interface; the alternative (deriving "fresh" purely from
`SettingsStore.load() == null`) was rejected because a user who has never
toggled a setting would be indistinguishable from a fresh install.

### D2: Don't defer `start()` — setup runs alongside the normal boot

`state.start()` fires as today, even while setup is showing. Rationale:

- The back-up step needs `exportRecoveryPhrase()`, which requires a bound
  transport anyway; binding during the fork screen hides that latency
  (mirrors the 1c rail's step 1 "identity — new key created" tick).
- "Create a new identity" then simply advances — the key already exists.
- "I have a recovery phrase" uses the existing `importRecoveryPhrase()`
  restore-in-place path unchanged: the eagerly generated key is a throwaway
  that gets overwritten, exactly the behavior the `identity` spec already
  defines. No new pre-bind import path needs to exist.

Alternative considered: delay bind until the fork is resolved and import the
restored key first. Rejected — it would need a new pre-bind import seam in
`network-real` and changes `ConnectService` boot ordering for no
user-visible gain.

### D3: Gate lives in `App.kt` as a composable wrapper, not in `AzulaState`

A `SetupGate` around the current `BoxWithConstraints` body in `AzulaApp()`:
it reads the gate signal (D1), shows `SetupFlow` until completion, then the
existing `DesktopApp`/`MobileApp` trees untouched. The `state.start()`
`LaunchedEffect` moves from `rememberAzulaState()` into the gate so the gate
can evaluate `hasPersistedIdentity()` first, then start immediately in both
branches. Setup-step state is a small local state machine
(`FORK → RESTORE? → BACKUP → PERSONA`), not new `AzulaState` surface —
neither existing nav scheme (mobile `MScreen` enum, desktop `desktopActive`
string) fits a pre-app flow, and setup should not enlarge the coordinator.

### D4: One `SetupFlow` with two presentations at the existing breakpoint

`SetupFlow` does its own `BoxWithConstraints`: ≥820dp renders the 1c step
rail (rail column + content pane inside a panel), below renders 1a stepped
cards (full-screen card per step, progress dots). Step content composables
(fork cards, word grid, persona form) are shared between the two shells;
only the chrome differs. The word grid is 2-column on compact, 3-column on
wide, per the blueprints.

### D5: Reuse, not duplicate, the existing flows

- Back-up step: words from `exportRecoveryPhrase()`; while it returns null
  (bind in flight or offline) the step shows a waiting state; Copy uses the
  existing clipboard seam from `RevealPhraseDialog`. "Save to password
  manager" invokes the platform share/save affordance where one exists
  (Android/iOS share sheet); on desktop JVM the action falls back to Copy.
- Restore step: same validate/commit path as `RestorePhraseDialog`
  (`state.importRecoveryPhrase`), inline error on false return. If
  `recovery-restore-ux` later adds confirmation semantics, this step
  inherits them by construction.
- Persona step: a slimmed first-run variant of `PersonaEditor` writing
  through `state.upsertPersona`; the auto-default-on-first-persona behavior
  in `PersonaService` makes it the default persona with no extra code.
  Skip writes nothing.
- Completion (finish or skip persona): write `setupCompleted = true` (and
  `backupDeferred = true` if "back up later" was chosen) to `AppSettings`.

### D6: Testing per the existing harness layers

- State layer: `testAzulaState(...)` with an injected `SettingsStore` whose
  `load()` returns null and `FakeTransport(hasPersistedIdentity = false)` —
  gate decision, deferral flag, restore path.
- JVM Compose: the `desktopE2eTest` harness mounts `SetupFlow` (or the
  gate) directly for step-machine and gating UI tests, tagging controls
  with `testTag`s like the existing Settings dialogs.
- Maestro: unchanged — mock apps keep skipping setup (FakeTransport default
  `true`); no new e2e flow in this change.

## Risks / Trade-offs

- [Bind fails on first launch (offline)] → back-up step shows its waiting
  state indefinitely with "back up later" still available; the phrase stays
  reachable later via Settings. No key is fabricated (identity spec).
- [`hasPersistedIdentity()` can't distinguish "no key" from "store
  unreadable" on macOS Keychain (`Lookup.Miss` vs `Lookup.Unavailable`)] →
  worst case an existing user with an unreadable Keychain sees setup once;
  choosing "create" is harmless (bind falls back to the same
  keystore-recovery behavior as today), and restore is available.
- [Moving `state.start()` out of `rememberAzulaState()` changes boot
  ordering for every caller] → both mock and real entry points go through
  `AzulaApp`/`installMockState`; test builders call `start()` themselves.
  Verify `mock-support` callers as part of implementation.
- [Setup restore commits without confirmation] → intentional; consistent
  with the current `identity` spec, and `recovery-restore-ux` owns changing
  it.

## Open Questions

- None blocking. "Save to password manager" scope (share sheet vs deeper
  integrations) is deliberately minimal in v1 per D5.
