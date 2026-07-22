## 1. Reconcile against existing coverage

- [x] 1.1 Read `mock-support/test@jvm/SettingsE2eTest.kt` and
      `mock-support/test/RecoveryPhraseRestoreTest.kt` and map which of
      personas / avatar upload / recovery-phrase reveal / recovery-phrase
      restore dialogs are already covered. Result: `SettingsE2eTest` already
      covered the settings screen rendering, persona *create*, the
      recovery-phrase reveal dialog, and restore with a *valid* phrase.
      Uncovered: persona select/rename/delete, the whole avatar-upload path,
      and restore's *invalid*-paste branch.
- [x] 1.2 Update this task list (and the proposal's Impact section) to drop
      anything already satisfied — 2.3 and section 3 dropped, see below.

## 2. Compose UI test coverage (JVM suite)

- [x] 2.1 Personas dialog: create/select/rename/delete flows. Create was
      already covered; added `settingDefaultOnASecondPersonaMovesTheDefault`
      (a lone persona is auto-defaulted by `PersonaService.upsert`, so moving
      the default is only observable with two), plus
      `editingAPersonaFromItsRowRenamesItInPlace` and
      `deletingAPersonaRemovesItFromState`.
- [x] 2.2 Avatar upload dialog: picker seam, success, failure/cancel states.
      Required building the seam first — the platform pickers are native
      modals no Compose test can drive, so `rememberFilePicker` now consults a
      `LocalFilePicker` composition local (the `expect` moved to
      `rememberPlatformFilePicker`). Covered by
      `pickingAnImageInThePersonaEditorSetsTheAvatar`,
      `cancellingThePickerLeavesTheAvatarUnset` and `pickingANonImageIsRejected`.
- [x] 2.3 Recovery-phrase reveal dialog. **Already satisfied** by the existing
      `revealPhraseDialogRendersThePhraseAfterConfirming`; no new test added.
- [x] 2.4 Recovery-phrase restore dialog: valid paste, invalid paste, commit.
      Valid paste + commit were already covered; added
      `restorePhraseDialogRejectsAnInvalidPhraseAndStaysOpen`, which also
      asserts the identity is left untouched by a rejected phrase.

## 3. iOS/Android e2e parity — dropped, gap already closed

- [x] 3.1 ~~Add a connect-flow case to `e2e/ios.yaml`~~ **Dropped as already
      satisfied.** The proposal's premise no longer holds: a later refactor
      extracted the steps into `e2e/subflows/connect-peer.yaml`, and
      `e2e/ios-media.yaml` runs that exact shared subflow — the same one
      `e2e/android.yaml` uses. iOS connect coverage exists; `e2e/ios.yaml`
      deliberately stays a launch/terminal smoke rather than duplicating a
      flow that needs a live chat. The delta spec was reworded to require
      parity of coverage per platform instead of naming `ios.yaml`.
- [x] 3.2 ~~Run both Maestro flows to confirm parity~~ **Dropped.** Parity now
      holds by construction (one shared subflow, executed by both platforms),
      which is what 3.1 verified by inspection. No Maestro run was performed
      here — a real simulator/emulator pass belongs with the hardware work in
      `media-device-verification` and `terminal-ime-device-pass`, which own
      the device harnesses.

## 4. Verify

- [x] 4.1 `./kotlin check -m mock-support` green: 109 JVM tests (11 in
      `SettingsE2eTest`, up from 4) and 84 native, 0 failures.
- [x] 4.2 `./kotlin build -m shared` green, confirming the
      `rememberFilePicker` → `rememberPlatformFilePicker` expect/actual rename
      still compiles on android, ios and jvm.
