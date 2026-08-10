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
- [x] 3.4 Size the interop view to the box's whole content area. Found during
      the simulator pass (2026-08-09): the box is `heightIn(min = 84.dp)` with
      9.dp padding, but the field was pinned to `20.dp` at the top — so ~46 of
      the 66dp content area rendered as the input and swallowed taps. A tap at
      the box's vertical centre did nothing, which on a phone is most of where
      a thumb lands. The field now takes the full content height with
      `contentVerticalAlignment = .top`, so the text sits exactly where it did
      and the whole box is live. The 84/9 numbers moved into
      `PhraseTextField.kt` as shared constants so the two halves can't drift
      back apart. Verified on the simulator: tapping the former dead zone now
      focuses the field and raises the keyboard.

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

## 5b. Release notes

- [x] 5b.1 Add the `CHANGELOG.md` entry. Neither `cc8e870` nor the follow-up
      `7e002af` touched `azula-app/CHANGELOG.md`, and filling a recovery phrase
      from the platform credential store is squarely user-observable — the
      convention in `project.md` is both tiers in the same commit. Written as
      part of the merge (`5a62485`): an `### Added` entry plus a new store-notes
      line, with the block re-checked at 363 bytes against the 500-byte cap.
      **The store line ships verbatim to Play/TestFlight/App Store — reword it
      if the voice is off.**

## 5c. Landed

- [x] 5c.1 Merged to `main` 2026-08-09. `azula-app` `5a62485` (feature + the
      hit-target fix + CHANGELOG; one import conflict against the `QrCode`
      import main had gained, resolved by keeping both, `jvm-app` compile
      verified). `azula-site` `4135543` — which **deployed**: the
      `get_login_creds` relation is live at
      `https://azula.app/.well-known/assetlinks.json`, carrying the same
      `sha256_cert_fingerprints` as the `handle_all_urls` statement. That merge
      also needed a modify/delete resolution, since main had moved
      `wellknown.ts`/`.test.ts` under `src/lib/`; the new case was ported to the
      new location and the stale copy deleted. 56 site tests pass.

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
      - **Simulator half: done** (2026-08-09, iPhone 17 Pro / iOS 26.5).
        Focusing the field and opening the edit menu offers **AutoFill**, and
        AutoFill → **Passwords** is present — iOS's password heuristics do find
        the embedded `UITextField`, which is the whole point of CMP-5802. With
        nothing saved for `azula.app` the menu closes without filling, which is
        the correct empty-vault behaviour. Also confirmed here: typing into the
        native field flips the Restore button to enabled, so the 3.3 sync works
        end to end.
      - Still open: a **real provider** round trip (1Password/Passwords actually
        returning a phrase). Needs the physical iPhone.
      - Note for whoever runs it: the simulator defaults to the *hardware*
        keyboard, which suppresses the QuickType/AutoFill bar entirely and makes
        this look broken. Turn the software keyboard on first.
- [ ] 6.4 Cross-build check: confirm the asset-link relation actually makes a
      phrase saved by one package visible to another, and test against a
      credential saved *before* the relation was published.
