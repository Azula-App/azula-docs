## 1. Reconcile against existing coverage

- [ ] 1.1 Read `mock-support/test@jvm/SettingsE2eTest.kt` and
      `mock-support/test/RecoveryPhraseRestoreTest.kt` and map which of
      personas / avatar upload / recovery-phrase reveal / recovery-phrase
      restore dialogs are already covered.
- [ ] 1.2 Update this task list (and the proposal's Impact section) to drop
      anything already satisfied.

## 2. Compose UI test coverage (JVM suite)

- [ ] 2.1 Personas dialog: create/select/rename/delete flows.
- [ ] 2.2 Avatar upload dialog: picker seam, success, failure/cancel states.
- [ ] 2.3 Recovery-phrase reveal dialog.
- [ ] 2.4 Recovery-phrase restore dialog: valid paste, invalid paste, commit.

## 3. iOS/Android e2e parity

- [ ] 3.1 Add a connect-flow case to `e2e/ios.yaml` mirroring
      `e2e/android.yaml`.
- [ ] 3.2 Run both Maestro flows on simulator/emulator to confirm parity.
