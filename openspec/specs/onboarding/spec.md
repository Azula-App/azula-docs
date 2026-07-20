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
