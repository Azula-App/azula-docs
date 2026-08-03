# Onboarding Specification

## Purpose
Defines the first-run setup flow that gates fresh installs behind an
identity fork (create or restore), a recovery-phrase back-up step, and an
optional persona step, before the main app opens, and how that flow adapts
its presentation to window size.
## Requirements
### Requirement: Setup Flow Gates Fresh Installs
The app SHALL present the setup flow before the main app on a launch where no
previously persisted identity key exists, and SHALL NOT present it when a
persisted key already exists (including installs that predate the setup
flow). `-mock` apps SHALL never present the setup flow. Until setup is
completed (finish or skip of the final step) the flow SHALL be shown again on
relaunch.

#### Scenario: Fresh install shows setup
- **WHEN** the app launches with no previously persisted identity key
- **THEN** the setup flow is shown before the main app

#### Scenario: Existing install skips setup
- **WHEN** the app launches and a persisted identity key already exists from
  a previous run (including installs upgraded from a version without setup)
- **THEN** the main app opens directly with no setup flow

#### Scenario: Mock app skips setup
- **WHEN** an `-mock` app launches (throwaway identity, nothing persisted)
- **THEN** the main app opens directly with no setup flow

#### Scenario: Relaunch mid-setup resumes setup
- **WHEN** the app is quit partway through setup and relaunched
- **THEN** the setup flow is shown again rather than the main app

### Requirement: Identity Fork
The first setup step SHALL offer exactly two paths: "create a new identity"
(visually recommended) and "I have a recovery phrase" (restore). Create
SHALL proceed to the back-up step. Restore SHALL accept a pasted 24-word
phrase using the `identity` capability's decode validation and
restore-in-place semantics: an invalid phrase SHALL show an inline error and
change nothing; a valid phrase SHALL commit the restored identity and skip
the back-up step, proceeding directly to the persona step.

#### Scenario: Create path
- **WHEN** the user chooses "create a new identity"
- **THEN** the flow advances to the back-up step showing this device's
  24-word recovery phrase

#### Scenario: Restore with a valid phrase
- **WHEN** the user chooses restore and submits a valid 24-word phrase
- **THEN** the restored identity is committed (per the `identity`
  restore-in-place requirement) and the flow skips back-up, advancing to the
  persona step

#### Scenario: Restore with an invalid phrase
- **WHEN** the user submits a phrase with a wrong word count, unknown word,
  or failing checksum
- **THEN** an inline error is shown, the identity is unchanged, and the user
  stays on the restore step

### Requirement: Recovery-Phrase Back-Up Step
The back-up step SHALL display all 24 words in a numbered word grid and
offer copy and save-to-password-manager actions. Continue SHALL be enabled
only after the user checks an explicit "I've saved my recovery phrase"
confirmation. A "back up later" action SHALL always be available; choosing
it SHALL advance without confirmation and SHALL persistently record that
backup was deferred, so the app can surface a reminder later.

#### Scenario: Continue gated on confirmation
- **WHEN** the back-up step is shown and the confirmation checkbox is
  unchecked
- **THEN** Continue is disabled; checking the box enables it

#### Scenario: Back up later defers
- **WHEN** the user chooses "back up later"
- **THEN** the flow advances without confirmation and the deferred-backup
  state is persisted

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

### Requirement: Persona Step Is Skippable
The persona step SHALL offer name, optional description, and optional
avatar, writing through the existing profile/persona store on finish. A
"skip for now" action SHALL complete setup without writing any persona data.
Per the `identity` capability, persona data SHALL NOT become part of the
identity or its recovery phrase.

#### Scenario: Persona saved
- **WHEN** the user enters a name and finishes
- **THEN** the persona is written to the profile store and the main app
  opens

#### Scenario: Persona skipped
- **WHEN** the user chooses "skip for now"
- **THEN** no persona data is written and the main app opens

### Requirement: Adaptive Setup Presentation
On wide/desktop windows the setup flow SHALL present a guided step rail
(identity → back up → persona → done, with completed/current/pending states)
beside the step content. On compact/phone windows it SHALL present stepped
full-screen cards with progress dots. Both presentations SHALL use only
existing design-system tokens; the blueprints are directions 1c (rail) and
1a (cards) of `Setup flow.dc.html` in the Claude Design setup-flow project.

#### Scenario: Desktop rail
- **WHEN** setup is shown in a wide/desktop window
- **THEN** a step rail listing all four steps with their states is shown
  beside the current step's content

#### Scenario: Phone cards
- **WHEN** setup is shown on a compact/phone window
- **THEN** each step is a full-screen card with progress dots indicating
  position in the flow

### Requirement: Start Sequence Is Idempotent
The app's start sequence SHALL run at most once per process, binding at most one transport endpoint however many times it is invoked. Platforms that invoke it more than once — Android starts the state from the `Application` and again from the composition's setup gate — SHALL NOT produce a second endpoint on the same secret key.

#### Scenario: Repeated start binds once
- **WHEN** the start sequence is invoked more than once in a process
- **THEN** the transport SHALL bind exactly one endpoint, and later
  invocations SHALL have no further effect

#### Scenario: Android starts the state twice
- **WHEN** Android starts the state from the `Application` and again from the
  setup gate
- **THEN** exactly one endpoint SHALL exist, with no orphaned endpoint sharing
  the same endpoint id and no orphaned inbound accept loop

