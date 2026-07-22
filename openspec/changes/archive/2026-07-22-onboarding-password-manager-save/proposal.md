## Why

The onboarding back-up step's "save to password manager" button does not touch
a password manager. It runs the same `clipboard.setText(phrase)` as the copy
button next to it (`SetupSteps.kt`, with a TODO saying share-sheet integration
is a follow-up). Two problems:

1. **The label promises something it doesn't do.** A user who taps it believes
   the phrase is in their vault. It isn't — it's on the clipboard, and the
   toast even says "✓ saved".
2. **The clipboard is the worst available destination for this particular
   secret.** The 24 words are the identity key; anyone holding them can take
   over the identity, as the copy directly above the button says. A clipboard
   is readable by the foreground app, is synced across devices by macOS
   Universal Clipboard, and persists until something overwrites it.

Android has a real API for this — `androidx.credentials.CredentialManager` —
and the app already meets its prerequisites.

## What Changes

- **Android**: "save to password manager" invokes
  `CredentialManager.createCredential` with a `CreatePasswordRequest`, which
  shows the OS save sheet backed by whichever provider the user has installed
  (1Password, Bitwarden, Google Password Manager, …).
- **iOS**: invokes the share sheet. iOS has no public API to add an item to the
  user's password manager programmatically; the AutoFill save prompt is
  triggered by the system observing a password field, not by a button.
- **Desktop JVM**: unchanged — falls back to the clipboard copy, as today.
- **Fallback**: when no credential provider is available or the save fails for
  any reason other than the user cancelling, fall back to the existing
  clipboard copy and say so, rather than silently reporting "✓ saved".
- Distinguish the two buttons' feedback. They currently share `state.copied`,
  so tapping either lights up both.
- **BREAKING** (build-level only): adds the `androidx.credentials`
  dependencies to `shared`'s `dependencies@android`.

This supersedes the share-sheet-everywhere plan recorded in
`specs/onboarding/design.md` ("Save to password manager invokes the platform
share sheet where one exists"), which was the deliberately minimal v1 scope
noted in the archived `initial-setup-flow` change. The share sheet stays as the
iOS path but is no longer the Android one: `ACTION_SEND text/plain` offers every
text-accepting app on the device — messaging, mail, notes — which is the
opposite of the advice printed two lines above the button, and password managers
are inconsistent about registering as plain-text share targets at all.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `onboarding`: the existing "Recovery-Phrase Back-Up Step" requirement already
  mandates that a save-to-password-manager action be *offered*; this adds
  normative behavior for what that action actually does per platform, and what
  happens when it can't.

## Impact

- `shared/src/dev/azula/ui/setup/SetupSteps.kt` — the back-up step's two
  buttons and their feedback state.
- New `expect`/`actual` seam in `shared/src/dev/azula/ui/` following the
  existing `FilePicker`/`MediaPicker` pattern, including the
  `staticCompositionLocalOf` test override those use (the platform sheet is a
  native modal, so a UI test that tapped this would otherwise hang).
- `shared/module.yaml` — `dependencies@android` gains `androidx.credentials`.
- `AzulaState.copied` / `markCopied()` — currently one flag driving both
  buttons.
- `azula-site/src/wellknown.ts` — optional: adding the
  `delegate_permission/common.get_login_creds` relation makes the saved entry
  appear under `azula.app` in the user's vault instead of as a bare Android
  package. Not required for the save itself to work. The signing fingerprint is
  already published there.
- `specs/onboarding/design.md` — the share-sheet sentence it currently states
  becomes wrong for Android.
