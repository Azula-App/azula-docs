## Context

The write path landed in `onboarding-password-manager-save`: `PhraseSaver`
(expect/actual + `LocalPhraseSaver` test seam) → `CredentialManager
.createCredential(CreatePasswordRequest(id = "", password = phrase))` on
Android, share sheet on iOS, clipboard on JVM. The `id` is empty because a
recovery phrase has no username; verified against the 1.3.0 bytecode that only
`password` is validated non-empty, in both `CreatePasswordRequest` and
`PasswordCredential` — so an empty id survives the read back out, which is what
this change depends on.

`RestoreStepContent` today: a `SetupField` bound to `var input`, a Restore
button gated on `input.isNotBlank()`, and `state.importRecoveryPhrase(input)`
with an inline error on failure. No autofill hints, no password semantics, no
credential call. Two spec requirements already constrain it (invalid phrases
show an inline error and change nothing), and `SetupFlowE2eTest` covers that.

Device testing surfaced the constraint that shapes this design: credentials
created via `createCredential` are scoped to the **calling package**. The phrase
saved during testing went in under `app.azula.mock`, and would not be offered to
`app.azula` no matter how good the read path is.

## Goals / Non-Goals

**Goals:**

- A phrase saved from the back-up step can be filled into the restore step
  without the user hand-copying it out of their vault.
- Works with third-party providers (1Password, Bitwarden), not just Google.
- The existing validate-then-commit path and its inline error are untouched.
- Testable without a native modal.

**Non-Goals:**

- Reworking the iOS *save* path from the share sheet to a Keychain prompt.
  The UIKit interop introduced here is what would unlock it, so it should
  follow closely — but it carries its own spec problem (see Open Questions) and
  shouldn't ride along silently.
- Passkeys, or any credential type other than a password.
- Autofill anywhere but the restore step.
- Desktop JVM.

## Decisions

**`getCredential` with an explicit affordance, not ambient autofill.** Android
offers two routes: the Autofill framework (hints on the field, system offers
inline) or Credential Manager's `getCredential` (the app asks, the provider
shows its own sheet). Choose the latter: it's the exact counterpart of the
`createCredential` already shipped, it works uniformly across providers, and it
gives a call site that can report "no saved phrase found" honestly. Ambient
autofill would make the absence indistinguishable from a bug.

**Fill suggests; it never commits.** The retrieved phrase goes into `input` and
the user still presses Restore. Restoring an identity replaces the device key —
too consequential to trigger from a picker selection, and routing fill through
the existing path means the checksum validation and inline error keep working
unchanged rather than needing a parallel error path.

**Reuse the `PhraseSaver` shape for `PhraseFiller`.** Same `fun interface` +
`staticCompositionLocalOf` + expect/actual layout, same three-outcome result
(filled / cancelled / unavailable). The symmetry is the point: one pattern for
both directions of the same feature, and the next person recognizes it.

**iOS gets native `UITextField` via `UIKitView`.** Per CMP-5802, Compose's
`KeyboardType.Password` does not trigger Apple's AutoFill; the heuristics need
real native fields with `textContentType` set. The reported workaround embeds a
transparent field and syncs state bidirectionally. Note the caveat from that
thread: embedded UIKit views can't be genuinely transparent, so the field's
background has to be colour-matched to its container — which means this touches
the design system's surface colors, not just layout.

**Publish `get_login_creds` and treat it as load-bearing.** The previous change
recorded this relation as cosmetic labelling. Device testing showed otherwise:
it is the mechanism that associates a credential with `azula.app` rather than a
single package, which is what makes a phrase saved in one build visible in
another. It requires an `azula-site` deploy, and that Worker auto-deploys on
push to main.

## Risks / Trade-offs

- **The empty username makes entries hard to tell apart in the provider's
  picker.** With no username, several saved phrases render near-identically →
  the picker still shows the app/domain, and in practice a user has one; but
  this is the first place the empty-id decision has a visible cost, and it
  should be re-examined against a real provider sheet rather than assumed fine.
  First evidence in: Apple's own Passwords app refuses a username-less entry
  without an "Are you sure you want to save this password without a user name?"
  confirmation. That's a save-path prompt, not a fill-path one, so it doesn't
  block this change — but it confirms the cost is real and visible, and that a
  provider may treat the entry as malformed rather than merely unlabelled.
- **The UIKit interop is the riskiest piece here.** It embeds a native view in
  the Compose tree, depends on undocumented Apple heuristics, and per the
  YouTrack thread needs colour-matching that will drift from the design system
  → keep it confined to the restore field, and treat a failure to trigger as
  acceptable degradation (the user pastes, as today) rather than a broken flow.
- **A provider returning a truncated or altered phrase fills silently wrong
  input** → the existing checksum validation catches it and shows the inline
  error, which is precisely why fill must not auto-commit.
- **Autocorrect-off may suppress the very AutoFill affordance iOS needs.** The
  native field sets `autocorrectionType`/`spellCheckingType` to `no` so iOS
  can't "correct" BIP-39 words into a failing checksum — but that also hides the
  QuickType bar, which is where iOS surfaces the password suggestion. Observed
  on the simulator: focusing the field brings up the keyboard with no bar at
  all. Whether the AutoFill row is exempt from that suppression is undocumented
  and could not be settled on the simulator (a debug-signed build doesn't verify
  associated domains, so an absent suggestion is ambiguous) → this is the first
  thing to test on a physical iPhone, and if AutoFill doesn't appear, trading
  autocorrect back on is the trade to evaluate.
- **Asset links change behavior for already-saved credentials** in ways that
  depend on provider implementation → verify against a phrase saved *before*
  the relation is published, not only after.

## Open Questions

- Does the iOS save path move to the same UIKit fields once the interop exists?
  It would replace the share sheet, whose top targets on a real device were
  Reminders and Save to Files — bad company for an identity key. The blocker is
  that a Keychain prompt has no completion callback, so the app cannot report
  what happened, contradicting the shipped requirement that feedback reflect the
  actual outcome. Resolving that means relaxing the requirement for iOS or
  reporting "unknown" honestly.
- Should Settings' `RevealPhraseDialog` gain fill too, or only the restore step?
- Is a "no saved phrase found" state worth surfacing, or should the affordance
  simply not appear when the provider returns nothing?
