## Context

The evidence is in `proposal.md`. What matters for design is its shape: a
symptom observed from outside the app, with the cause not yet identified.

Three failure points sit between the button and a usable invite, and the
observations do not distinguish them:

1. **Mint** — the invite is never successfully created.
2. **Persist** — it is created but not written to an issuer-side store.
3. **Present** — it is created and stored but never surfaced to the user.

All three produce exactly what was seen: a sheet that dismisses and no invite
anywhere. Picking a fix before separating them would be guessing, so this
change deliberately has an investigation phase and no committed
implementation.

One asymmetry is worth noting: failure 2 is the dangerous one. Failures 1 and
3 are visible dead ends — annoying, self-evident once you look. Failure 2 is
silent and produces invites that *look* fine and fail later at redemption,
because `invitations`' "Issuer-Side Persistence Is Authoritative" gates
acceptance on the issuer's own record. If task 1 finds 2, the blast radius is
wider than the button.

The CLI is the working reference throughout: `azula invite` mints, persists to
`~/.azula/invites`, and prints both a URL and a QR. `cmd_invite_mint` and
`invite.rs` are what the app's path should be compared against.

## Goals / Non-Goals

**Goals:**

- Establish which of the three failure points is actually responsible, on a
  current build.
- Completing the flow leaves the user holding a usable invite, or tells them
  why not.
- An invite the user can obtain is one the issuer will honour at redemption.

**Non-Goals:**

- Redesigning the invite UI. The sheet's options (expiry, sign, single-use)
  are not in question; only that finishing it yields nothing.
- Changing the invite payload, encoding, or link formats — `invitations`
  already specifies those and the CLI implements them correctly.
- The CLI side. It works.
- Invite *revocation* UI. Related (revocation needs an issuer-side store to
  operate on) but a separate concern; note it if task 1 finds the store
  missing, don't build it here.

## Decisions

### 1. Investigate before designing — task 1 gates the rest

No implementation decision is made in this document. The three failure points
call for different fixes in different layers, and the observation is external.
Task 1 separates them; the fix follows the finding.

This is deliberate rather than lazy: the tempting move is to assume
"present" (the sheet is right there, and it's the cheapest fix), when the
absence of any issued-invite store in the app container points at "persist".
Committing to the cheap answer would leave a silent redemption failure in
place, dressed up as fixed.

### 2. Reproduce on a current build first

The observation is from a 2026-08-03 build. Nothing should be designed against
a six-day-old binary when the tree has moved. If a current build mints,
persists, and presents correctly, this change closes as already-fixed — and
the archived `cli-naming-and-registry-keying` task 5.2 note should be
corrected to say so.

### 3. Whatever the cause, the failure becomes visible

Independent of which layer is at fault, a mint that cannot produce a usable
invite must not dismiss the sheet as though it had. Silent success on failure
is what turned this into a hardware-session discovery rather than something
the user could have reported precisely.

## Risks / Trade-offs

- **The bug may not reproduce** — build drift, or a state-dependent path (this
  device has exactly one known peer and one conversation). → Task 1 records
  the build sha and device state, so a non-reproduction is informative rather
  than merely inconclusive.
- **Investigation could sprawl into the invite subsystem.** → Task 1 is
  bounded: identify the failing layer, not fix it. Stop at the finding.
- **A device-specific cause** (that Pixel's install, its single-peer state)
  would misdirect a general fix. → Task 1.4 checks a second device or a clean
  emulator install before concluding.

## Open Questions

- Where are app-side issued invites *meant* to persist? The container held no
  candidate. If the answer is "nowhere yet", that is the finding, and
  "Issuer-Side Persistence Is Authoritative" is currently unimplementable on
  the app side — which would mean app-issued invites have never been
  redeemable, and the requirement has only ever been satisfied by the CLI.
- Does the app support issuing at all today, or is its pairing story
  redeem-only (scan someone else's invite) with the create-invite sheet ahead
  of its backing? The sheet's presence implies the former; the empty container
  implies the latter.
- Does iOS behave the same? Untested — the iPhone available at the time was in
  use by another session, and nothing here can drive a physical iPhone
  (see the `ios-physical-device-automation` note).
