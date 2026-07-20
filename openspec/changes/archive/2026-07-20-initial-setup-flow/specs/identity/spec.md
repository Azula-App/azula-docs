# Identity Delta

## MODIFIED Requirements

### Requirement: Export Flow Requires Explicit Reveal
Revealing the recovery phrase outside the initial setup flow SHALL require a
two-step dialog that never displays the phrase on first paint: a
warning-only first step, then the 24 words only after explicit confirmation.
The initial setup flow's back-up step SHALL display the 24 words directly —
the user's explicit "create a new identity" choice on the immediately
preceding step serves as the deliberate first step. In both contexts, if the
transport has not yet bound, export SHALL fail with a message telling the
user to connect first, rather than showing a partial or fabricated phrase.

#### Scenario: Reveal attempted before transport binds
- **WHEN** the user opens the reveal-recovery-phrase flow before the
  transport has ever bound
- **THEN** the app shows a "not ready yet" message instead of a phrase, and
  no phrase is generated

#### Scenario: Two-step reveal
- **WHEN** the user opens the reveal-recovery-phrase flow with a bound
  transport
- **THEN** the app first shows a warning-only step, and shows the 24 words
  only after the user explicitly proceeds

#### Scenario: Setup back-up step shows the phrase directly
- **WHEN** the user reaches the setup flow's back-up step after choosing
  "create a new identity"
- **THEN** the 24 words are shown directly without an additional
  warning-only interstitial
