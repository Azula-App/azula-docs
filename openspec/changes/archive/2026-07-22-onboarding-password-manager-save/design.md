## Context

`BackupStepContent` renders two `SetupLinkButton`s with identical `onClick`
bodies — `clipboard.setText(AnnotatedString(phrase)); state.markCopied()` — and
both read `state.copied` for their label, so tapping one flips both to their
"done" text. `markCopied()` sets a flag and clears it after 1400 ms.

The app already has the shape this needs. `FilePicker` / `MediaPicker` establish
the pattern for a native modal behind an `expect`/`actual`, with a
`staticCompositionLocalOf` override so UI tests don't block on a real OS dialog
— the comment on `LocalFilePicker` records that the avatar-upload path had no
coverage until that seam existed. `shared/module.yaml` already has a
`dependencies@android:` block. `SetupFlowE2eTest` drives the back-up step by
test tag but never taps either action button.

On the site side, `wellknown.ts` already publishes the Play App Signing SHA-256
under `delegate_permission/common.handle_all_urls`, and the AASA file already
carries `webcredentials: { apps: [IOS_APP_ID] }`.

## Goals / Non-Goals

**Goals:**

- On Android, the button opens the real OS save-to-password-manager sheet.
- On every platform, the button's feedback tells the truth about what happened.
- A device with no credential provider degrades to the current behavior rather
  than failing silently or appearing to succeed.
- The path stays testable without a real OS modal.

**Non-Goals:**

- Programmatic password-manager saving on iOS. There is no public API; the
  AutoFill "Save Password" prompt is driven by the system observing a real
  password field being submitted, and `SecAddSharedWebCredential` has been
  deprecated since iOS 14. iOS gets the share sheet.
- Reading credentials back out (autofill on restore). That's the inverse flow
  and a separate change.
- Passkeys. A recovery phrase is a secret to store, not an authenticator.
- Changing what the phrase *is* or how it's derived.

## Decisions

**`CreatePasswordRequest`, not a custom credential type.** Credential Manager
supports arbitrary structured credentials, but every provider understands a
password, and a 24-word phrase is exactly what people already paste into a
password field. A custom type would be understood by nothing.

**Save the phrase as the password, with a stable descriptive id as the
username.** `CreatePasswordRequest(id, password)` needs both. The phrase goes in
`password`; `id` gets a fixed, human-legible identifier so the vault entry reads
sensibly when the user later goes looking for it. It must not be the persona
name — that's user-editable and may not exist yet at this point in onboarding.

**Asset links are optional here, and left as a follow-up decision.** Digital
Asset Links with `get_login_creds` govern *sharing* credentials between
`azula.app` and the app; a password saved from within the app is associated with
the Android package regardless. Adding the relation only changes how the entry
is labelled in the user's vault (`azula.app` vs. a bare package name). Worth
doing, but it touches a deployed Worker and shouldn't gate the app change.

**Fall back to the clipboard, and say which happened.** Three outcomes have to
be distinguishable: saved to a manager, user cancelled the sheet, and no
provider available. Cancelling must not claim success and must not silently
dump the phrase on the clipboard — the user actively declined. Only the
no-provider / error case falls back to the clipboard, and the label says
"copied" rather than "saved" when it does.

**Split the two buttons' state.** One `copied` flag driving both labels is
already wrong today (tapping copy lights up "✓ saved") and gets worse once the
two actions genuinely differ. Replace with per-action feedback. `markCopied()`'s
1400 ms auto-clear is a reasonable interaction to keep; it just needs to be
addressable per button.

**Follow the `FilePicker` seam exactly.** A `fun interface` +
`staticCompositionLocalOf` override + `remember…` expect/actual. This is what
makes a UI test possible at all, and matching the existing pattern means the
next person recognizes it. Alternative considered: calling `CredentialManager`
straight from the composable — rejected, it would hang any UI test that tapped
the button, which is exactly the hole `LocalFilePicker` was created to close.

## Risks / Trade-offs

- **The phrase reaches a third-party provider process.** That is the point of
  the feature, and strictly better than the clipboard, but it is a real
  disclosure to whatever provider the user has chosen → the OS sheet names the
  provider before anything is written, so the choice is the user's and is
  visible.
- **`CredentialManager` needs an `Activity`, not just a `Context`** → resolve
  it in the Android actual and fail into the clipboard fallback if the cast
  fails, rather than crashing during onboarding.
- **Older devices route through Play Services** (`credentials-play-services-auth`)
  and a device without Play Services has no provider at all → this is precisely
  the no-provider fallback path; it must be exercised, not just written.
- **Play Console app-signing means the debug build's fingerprint differs from
  the published one** → asset-link-dependent behavior will look broken in a
  local debug build. Another reason not to make the save depend on asset links.
- **A provider could truncate a ~170-character password** → verify the round
  trip on a real provider during the device check; a silently truncated
  recovery phrase is unrecoverable and would not be noticed until it was needed.

## Open Questions

- **iOS via UIKit interop instead of the share sheet.**
  [CMP-5802](https://youtrack.jetbrains.com/issue/CMP-5802) documents why
  Compose's `KeyboardType.Password` never triggers Apple's Keychain prompts —
  Apple's heuristics need real native `UITextField`s — and a community
  workaround that embeds a transparent `UITextField` via `UIKitView` with the
  correct `textContentType`, reported to fire the prompt reliably. The AASA
  file already publishes `webcredentials`, so the association half is in place.
  Two things to weigh before adopting it: the back-up step has no text input at
  all today (the workaround needs fields to exist and then go away), and the
  prompt is a *system heuristic* with no completion callback — so the app
  cannot know whether the user saved. That directly contradicts this change's
  requirement that feedback reflect what actually happened, which would have to
  be relaxed for iOS or reported honestly as unknown. Device testing showed the
  current share sheet offering Reminders and Save to Files as its top targets
  for an identity key, which is an argument for revisiting it.
- Should Settings' `RevealPhraseDialog` get the same button? It has the same
  "store in a password manager" copy and the same clipboard-only action. Out of
  scope here, but it's the obvious second home.
- Add the `get_login_creds` relation to `assetlinks.json` in this change or a
  follow-up? It requires a Worker deploy, and `azula-site` auto-deploys on push
  to main.
