## Why

The recovery-phrase restore flow shipped, but two product-decision questions
were left open rather than resolved:

- Restore commits on a single tap after a valid paste — there is no second
  confirmation before the current identity is overwritten (and it is not
  archived first).
- On restore, `transport.onCameOnline` triggers `reconnectSaved()` against the
  *previous* identity's saved peer tickets — usually a dead end on a fresh
  device. Harmless today, but worth deciding intentionally rather than by
  accident.

See `openspec/specs/identity/design.md` (Restore flow) for the current
implementation this sits on top of.

## What Changes

This change is a decision-then-implement item, not a scoped implementation
yet:

- Decide: should restore require a second confirmation step before
  overwriting the current identity? Should the overwritten identity be
  archived rather than discarded?
- Decide: should `reconnectSaved()` on restore be skipped, scoped to the new
  identity, or left as-is (and if left as-is, is the current behavior
  documented as intentional)?
- Once decided, implement the chosen behavior and update
  `openspec/specs/identity/design.md` (Restore flow) to reflect it.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `identity`: pending the product decisions above, restore-flow requirements
  (confirmation-before-overwrite, archival, post-restore reconnect behavior)
  may change. No delta spec is authored yet — write one once the decisions
  land.

## Impact

- Restore-flow UI/state layer (see `identity` capability and
  `openspec/specs/identity/design.md`, Restore flow section).
- `transport.onCameOnline` / `reconnectSaved()` wiring.
