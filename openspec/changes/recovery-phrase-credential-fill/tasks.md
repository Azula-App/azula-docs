## 1. The seam

- [x] 1.1 Add a `PhraseFiller` expect/actual in `shared/src/dev/azula/ui/`,
      mirroring the shipped `PhraseSaver`: `fun interface`,
      `staticCompositionLocalOf` test override, `rememberPhraseFiller()`
      delegating to `rememberPlatformPhraseFiller`.
- [x] 1.2 Result type covering filled(phrase) / cancelled / unavailable, so the
      UI can tell "user dismissed" from "nothing saved".

## 2. Android

- [x] 2.1 `CredentialManager.getCredential` with a `GetPasswordOption`; map the
      returned `PasswordCredential.password` to filled. Map
      `GetCredentialCancellationException` to cancelled and
      `NoCredentialException` to unavailable.
- [ ] 2.2 Confirm an empty-`id` credential (what the save path writes) round
      trips — the bytecode says only `password` is validated non-empty, but
      confirm against a real provider, not just the class file.

## 3. iOS

- [x] 3.1 `UIKitView` interop hosting a native `UITextField` for the restore
      input, with `textContentType` set so AutoFill engages (CMP-5802).
- [x] 3.2 Colour-match the field's background to its container — embedded UIKit
      views can't be truly transparent. Take the value from
      `specs/design-system/design.md`, don't eyeball it.
- [x] 3.3 Bidirectional state sync between the native field and Compose, so
      typing, filling, and the Restore button's `isNotBlank` gate all agree.

## 4. Restore step UI

- [x] 4.1 Wire the fill affordance; filled text goes into `input` only.
- [x] 4.2 Verify the validate-then-commit path and inline error are untouched —
      both are existing spec requirements with existing tests.
- [x] 4.3 Decide whether the affordance hides or reports when nothing is saved
      (design.md, Open Questions).

## 5. Site

- [x] 5.1 Add the `delegate_permission/common.get_login_creds` relation to
      `azula-site/src/wellknown.ts`, plus a case in `wellknown.test.ts`.
- [x] 5.2 `npm run typecheck` and the Worker tests. Note `azula-site`
      auto-deploys on push to main — this ships the moment it merges.

## 6. Tests

- [x] 6.1 UI tests through the `LocalPhraseFiller` override: filled, cancelled,
      unavailable, and a filled-but-invalid phrase still showing the inline
      error. Anchor matchers to a test tag or an ancestor, never a bare text
      match — see `specs/testing/design.md`, "Known flakes".
- [ ] 6.2 On-device Android check on the Pixel with 1Password: save a phrase on
      the back-up step, then fill it on the restore step. Check what a
      username-less entry looks like in the picker — the empty `id` shipped in
      `onboarding-password-manager-save` has its first visible cost here.
- [ ] 6.3 iOS check. Simulator can show whether AutoFill engages with the native
      field at all; a real provider needs a physical iPhone, which the simulator
      tooling can't drive.
- [ ] 6.4 Cross-build check: confirm the asset-link relation actually makes a
      phrase saved by one package visible to another, and test against a
      credential saved *before* the relation was published.
