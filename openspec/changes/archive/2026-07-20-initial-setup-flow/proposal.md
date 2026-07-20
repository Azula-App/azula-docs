# Initial Setup Flow

## Why

A fresh install of azula-app currently drops the user straight into the main
app: an identity keypair is generated silently on first launch, the 24-word
recovery phrase is never surfaced unless the user later finds the export flow
in Settings, and there is no moment to restore an existing identity or set up
a persona. Users who lose the device before ever opening Settings lose the
identity permanently, and users migrating devices have to discover
restore-from-phrase on their own.

The Setup flow design (Claude Design project `0598a0ab-…`,
`Setup flow.dc.html`) resolves this with a fresh-install onboarding flow.
The chosen direction is **1c + 1a**: a guided step rail on desktop/wide
windows, stepped cards on phones.

## What Changes

- New first-launch setup flow in azula-app, shown once on fresh installs
  before the main app:
  1. **Identity fork** — "Create a new identity" (recommended) vs "I have a
     recovery phrase" (restore).
  2. **Back up** — the 24-word recovery phrase in a numbered word grid, with
     Save-to-password-manager and Copy actions, an "I've saved my recovery
     phrase" confirmation checkbox gating Continue, and an explicit
     "back up later" escape hatch.
  3. **Persona** — name, optional bio, optional avatar; skippable.
  4. **Done** — enter the main app.
- Adaptive layout per the chosen design direction: step rail + content pane
  (1c) on desktop/wide windows; stepped cards with progress dots (1a) on
  phones. All visuals from the azula design system — no new tokens.
- The restore path reuses the existing restore-in-place semantics from the
  `identity` capability (validation, inline errors, transport rebind).
- Silent first-launch keygen remains the underlying mechanism (the transport
  still binds with a generated key); the setup flow gates *entry to the app*
  and surfaces backup, it does not change how keys are created or stored.
- `-mock` apps and existing installs (a persisted key already exists) skip
  the setup flow entirely.

## Capabilities

### New Capabilities

- `onboarding`: the fresh-install setup flow — when it appears (and when it
  is skipped), the identity fork, the recovery-phrase backup step and its
  confirmation/defer semantics, the skippable persona step, and the adaptive
  desktop-rail vs mobile-cards presentation.

### Modified Capabilities

- `identity`: the "Export Flow Requires Explicit Reveal" requirement is
  scoped to post-setup reveals (Settings). The onboarding backup step shows
  the 24 words directly — the user has just explicitly chosen "create a new
  identity", which serves as the deliberate first step; a warning-only
  interstitial there would be noise. All other identity requirements
  (encoding, validation, storage, restore-in-place) are unchanged and reused
  as-is.

## Impact

- `azula-app/shared` — a new setup screen surface ahead of the main app
  scaffold, first-run detection, and wiring to the existing export/restore
  seams; possibly a small persisted "setup completed / backup deferred"
  flag in the settings/profile store.
- Persona step writes through the existing profile/persona store
  (`persistence-api`/`persistence-real`); personas remain excluded from
  identity per the `identity` spec.
- UI tests in the `-mock` apps + Maestro e2e flows (see `specs/testing/`)
  — note `-mock` apps skip setup, so coverage needs an explicit way to force
  the flow.
- Design source of truth: `specs/design-system/design.md` tokens only;
  screen blueprints from `Setup flow.dc.html` directions 1a/1c.
- Related pending change: `recovery-restore-ux` (restore confirmation /
  reconnect-after-restore decisions). The setup-flow restore path should
  inherit whatever that change decides; this change does not pre-empt it.
