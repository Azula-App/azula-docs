## Why

`onboarding-password-manager-save` shipped the write half: the back-up step
hands the recovery phrase to Android's Credential Manager, verified on-device
into a real 1Password vault. The read half doesn't exist. `RestoreStepContent`
is a plain `SetupField` and nothing on that screen ever calls Credential
Manager, so a password manager has nothing to respond to — the phrase is in the
vault, and the one screen that exists to consume it can't see it.

Caught immediately in device testing, which is the point: saving a secret to a
vault the app can't read back is half a feature. The user's fallback is to open
their password manager, copy the phrase by hand, and paste it — on a phone,
into a 24-word field.

## What Changes

- **Android**: the restore step requests a saved password via
  `CredentialManager.getCredential` with a `GetPasswordOption`, and fills the
  returned phrase into the input. The user picks from the provider's own sheet.
- **iOS**: introduce the `UIKitView` interop from
  [CMP-5802](https://youtrack.jetbrains.com/issue/CMP-5802) — a native
  `UITextField` with the right `textContentType`, colour-matched to its
  container — so iOS AutoFill and third-party providers can offer the phrase.
  Compose's own `KeyboardType.Password` never triggers these; Apple's
  heuristics require real native fields.
- **Desktop JVM**: unchanged. No system credential store to read from; paste
  keeps working.
- Fill is a *suggestion*, not a commit: the phrase lands in the input and the
  existing validate-then-commit path (`importRecoveryPhrase`, inline error on a
  bad checksum) runs exactly as it does for a typed or pasted phrase.
- Publish the `delegate_permission/common.get_login_creds` relation in
  `azula-site`'s `assetlinks.json`, so a credential is associated with
  `azula.app` rather than only with the calling package.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `onboarding`: adds normative behavior for the restore step — offering a saved
  recovery phrase from the platform credential store, and what happens when
  there isn't one — alongside the existing restore requirements.

## Impact

- `shared/src/dev/azula/ui/setup/SetupSteps.kt` — `RestoreStepContent`'s input
  and a fill affordance. Must not disturb the validate-then-commit path or the
  inline-error behavior, both of which have spec requirements and tests.
- A `PhraseFiller` expect/actual alongside the existing `PhraseSaver`, with the
  same `staticCompositionLocalOf` test seam — the platform sheet is a native
  modal that would hang a UI test.
- **iOS UIKit interop** — the repo's second (after `PickerInterop.ios.kt`), and
  the first that embeds a native view *inside* the Compose tree rather than
  presenting one over it.
- `azula-site/src/wellknown.ts` + its tests — the new asset-link relation. The
  signing fingerprint is already published there.
- **Package scoping is the sharp edge.** Credentials from `createCredential` are
  scoped to the *calling package*: anything saved from `app.azula.mock` is
  invisible to `app.azula`. The asset-link relation is what bridges them via the
  domain, which is why it moves from cosmetic to load-bearing here.
