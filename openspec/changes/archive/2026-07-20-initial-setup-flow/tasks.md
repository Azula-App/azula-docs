# Initial Setup Flow — Tasks

## 1. Gate plumbing (state + persistence)

- [x] 1.1 Add `setupCompleted: Boolean` and `backupDeferred: Boolean` to
  `AppSettings` + serialization in `SettingsStore`
  (`persistence-api/src/dev/azula/persist/SettingsStore.kt` and the three
  platform impls), following the existing single-flag pattern
- [x] 1.2 Add `hasPersistedIdentity(): Boolean` to `IrohTransport`
  (`network-api`) and implement it as a pre-bind `SecretKeyStore`/Keychain
  probe in `IrohFfiTransport` (jvmAndAndroid) and `IosIrohTransport` (ios)
- [x] 1.3 Add a constructor-controllable `hasPersistedIdentity` to
  `FakeTransport` (`mock-support`), defaulting to `true` so `-mock` apps
  skip setup
- [x] 1.4 Move the `state.start()` `LaunchedEffect` out of
  `rememberAzulaState()` (`shared/src/dev/azula/state/AppEntry.kt`) into the
  setup gate; verify every `mock-support`/test caller still starts correctly
- [x] 1.5 Expose gate evaluation + completion on the state layer (per
  design D1): read flag → probe key → decide {main, main+write-flag,
  setup}; completion writes `setupCompleted` (+ `backupDeferred`)

## 2. Setup UI — shared step content

- [x] 2.1 Create `shared/src/dev/azula/ui/setup/` with the step state
  machine (`FORK → RESTORE? → BACKUP → PERSONA`) and `SetupFlow` entry
  composable wired into a `SetupGate` wrapper in `App.kt`
- [x] 2.2 Fork step: create-new card (recommended pill, primary glow) +
  restore card, per blueprint 1a/1c; design-system tokens only
- [x] 2.3 Restore step: phrase paste field → `state.importRecoveryPhrase`,
  inline error on invalid, success advances to persona (skipping backup)
- [x] 2.4 Back-up step: numbered word grid (2-col compact / 3-col wide),
  Copy + save-to-manager actions (share sheet on Android/iOS, Copy fallback
  on desktop), waiting state while `exportRecoveryPhrase()` is null,
  confirmation checkbox gating Continue, "back up later" recording deferral
- [x] 2.5 Persona step: first-run variant of the persona form (name, bio,
  avatar picker) writing via `state.upsertPersona`; "skip for now" writes
  nothing; both complete setup

## 3. Setup UI — adaptive shells

- [x] 3.1 Wide shell (1c): step rail (identity / back up / persona / done
  with completed–current–pending states) beside the content pane, ≥820dp
- [x] 3.2 Compact shell (1a): full-screen stepped cards with progress dots
  and the brand lockup header, <820dp

## 4. Tests

- [x] 4.1 State-layer tests (`mock-support/test`): gate decision matrix
  (fresh / upgraded / completed / mock), mid-flow resume, deferral flag,
  restore-in-setup path — via `testAzulaState` with injected `SettingsStore`
  and `FakeTransport(hasPersistedIdentity = false)`
- [x] 4.2 JVM Compose tests (`desktopE2eTest` harness): fork → backup →
  persona happy path, Continue gated on checkbox, restore inline error;
  add `testTag`s to setup controls
- [x] 4.3 Run `./kotlin check -m shared` and the mock-app builds; confirm
  Maestro flows still pass unchanged (mock apps skip setup)

## 5. Docs

- [x] 5.1 Write `openspec/specs/onboarding/design.md` prose companion
  (gate signal rationale, step machine, blueprint pointers) and update
  `openspec/specs/identity/design.md`'s export-flow section for the
  setup-scoped reveal
