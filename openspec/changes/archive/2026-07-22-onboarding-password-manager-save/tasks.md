## 1. The seam

- [x] 1.1 Add a `PhraseSaver` expect/actual in `shared/src/dev/azula/ui/`,
      following the `FilePicker` pattern exactly: a `fun interface`, a
      `staticCompositionLocalOf` override for tests, and a
      `rememberPhraseSaver()` composable delegating to
      `rememberPlatformPhraseSaver`.
- [x] 1.2 Define the result type the actuals report back: `PhraseSaveResult`
      with `SAVED` / `CANCELLED` / `UNAVAILABLE`.

## 2. Platform actuals

- [x] 2.1 Android: `CredentialManager.createCredential` with a
      `CreatePasswordRequest`. Unwraps the `ContextWrapper` chain for an
      `Activity` and reports `UNAVAILABLE` rather than crashing if there isn't
      one; `CreateCredentialCancellationException` maps to `CANCELLED`, every
      other failure to `UNAVAILABLE`.
- [x] 2.2 Added `androidx.credentials:credentials:1.3.0` and
      `credentials-play-services-auth:1.3.0` to `dependencies@android`.
- [x] 2.3 iOS: `UIActivityViewController` via the existing `topViewController()`
      presenter, with the iPad popover anchor set.
- [x] 2.4 JVM: reports `UNAVAILABLE` so desktop keeps its clipboard behavior.

## 3. Back-up step UI

- [x] 3.1 Save button wired to the seam; `UNAVAILABLE` falls back to the
      clipboard and labels it "✓ copied instead", `CANCELLED` does nothing at
      all, `SAVED` reads "✓ saved".
- [x] 3.2 Split the copy/save feedback — save now has local state instead of
      sharing the app-wide `state.copied` flash.
- [x] 3.3 Vault entry id settled as **empty** — a recovery phrase is a bare
      secret, not a login, so it has no username. `CreatePasswordRequest`
      requires the `id` parameter but validates only the password non-empty
      (confirmed against the 1.3.0 bytecode: `"password should not be empty"` is
      the only such check in `CreatePasswordRequest` *and* `PasswordCredential`,
      so an empty id also survives a future read back).

## 4. Tests

- [x] 4.1 `SetupFlowE2eTest` covers all three outcomes through the
      `LocalPhraseSaver` override, with a `RecordingClipboard` asserting what
      was and wasn't written. All matchers anchored to test tags.
- [x] 4.2 `copyAndSaveReportIndependently` — would have failed before 3.2.
- [x] 4.3 **Android verified on-device** (Pixel 10 Pro XL, API 36, 1Password
      installed, via `android-app-mock`): the save sheet appeared, the button
      read "✓ saved", the entry landed in 1Password, and all 24 words
      round-tripped intact with no truncation. The cancel path wrote nothing to
      the clipboard, as specified.
- [x] 4.4 **Desktop (JVM) verified**: `UNAVAILABLE` → clipboard fallback, label
      read "✓ copied instead". Exercises the real `PhraseSaver.jvm.kt` actual,
      which the UI tests bypass via the `LocalPhraseSaver` override.
- [x] 4.5 **iOS verified on the simulator** (iPhone 17 Pro): the share sheet
      presents with the phrase, presentation doesn't crash, and dismissing maps
      to `CANCELLED` — the button stayed on its idle label and claimed nothing.
      Not verifiable there: a real provider receiving the phrase, since the
      simulator has none installed. See 5.4 — the sheet's actual targets make
      the iOS story worth revisiting regardless.

## 5. Docs / follow-ups

- [x] 5.1 Updated `specs/onboarding/design.md` — the share-sheet-everywhere
      sentence is replaced with the per-platform behavior and the
      three-outcome rule.
- [x] 5.2 Resolved: moved into `recovery-phrase-credential-fill`, where it is
      load-bearing rather than cosmetic. Device testing showed credentials are
      scoped to the calling package, so the `get_login_creds` relation is the
      mechanism that associates a phrase with `azula.app` instead of one build.
- [x] 5.3 Carried forward as an open question in
      `recovery-phrase-credential-fill`'s design.md — Settings'
      `RevealPhraseDialog` still has the same copy and clipboard-only behavior,
      and wants the same treatment in both directions at once.
- [x] 5.4 Filed as **`recovery-phrase-credential-fill`**: saving to a vault the
      restore step can't read from is half a feature, caught in device testing.
      Covers `getCredential` on Android and the CMP-5802 `UIKitView` interop on
      iOS.
- [x] 5.5 The iOS save rework (share sheet → Keychain prompt) is recorded as an
      open question in `recovery-phrase-credential-fill`'s design.md rather than
      a task: the UIKit interop that change introduces is what unlocks it, but
      a Keychain prompt has no completion callback, which contradicts this
      change's shipped requirement that feedback reflect the actual outcome.
      Needs that tension resolved before it becomes work.
