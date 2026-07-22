## ADDED Requirements

### Requirement: Save-To-Password-Manager Uses The Platform Credential Store

The back-up step's save-to-password-manager action SHALL hand the recovery
phrase to the platform's credential store where one exists, rather than to the
clipboard. On Android it SHALL invoke the system credential-creation flow so the
user's installed password-manager provider receives the phrase. On platforms
with no such API it SHALL use the platform share sheet, and on desktop it SHALL
fall back to the clipboard.

The action's feedback SHALL reflect what actually happened — saved, cancelled,
or fallen back to the clipboard — and SHALL NOT report success when the phrase
was only copied. The copy action and the save action SHALL have independent
feedback, so acting on one does not report completion for the other.

#### Scenario: Saving on a device with a password-manager provider

- **WHEN** the user taps save-to-password-manager on Android with a credential
  provider installed, and completes the system sheet
- **THEN** the recovery phrase is stored via the platform credential store and
  the action reports that it was saved

#### Scenario: The user cancels the system sheet

- **WHEN** the user taps save-to-password-manager and dismisses the system
  sheet without completing it
- **THEN** the phrase is not written to the clipboard, and the action does not
  report success

#### Scenario: No credential provider is available

- **WHEN** the user taps save-to-password-manager on a device with no
  credential provider, or the save fails for a reason other than the user
  cancelling
- **THEN** the action falls back to copying the phrase to the clipboard and
  reports that it was copied, not that it was saved

#### Scenario: Copy and save report independently

- **WHEN** the user taps the copy action
- **THEN** only the copy action shows its completed state; the
  save-to-password-manager action is unchanged, and the reverse holds when the
  save action is used
