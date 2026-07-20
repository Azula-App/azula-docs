## Why

The smart-input / selection / scrollback / persistent-sessions terminal work
shipped (see `openspec/specs/terminal/design.md`). Its `terminalSmartInput`
setting is persisted by piggybacking on the personas blob (`ProfileBook`) —
there is no dedicated settings store. That's fine at one flag, but more
settings are accumulating (see `terminal-mouse-reporting`,
`mock-terminal-resize-greeting` in this same backlog) and each new one would
otherwise pile onto the same ad hoc piggyback.

## What Changes

- Extract a real `SettingsStore` (its own persisted blob, following the
  existing `ProfileStore`-style JSON-blob pattern used elsewhere in the app)
  instead of piggybacking settings on `ProfileBook`.
- Migrate `terminalSmartInput` off `ProfileBook` and onto the new store.
- Leave room for the mouse-reporting and other pending settings to land on the
  new store directly rather than on `ProfileBook`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `terminal`: settings persistence for `terminalSmartInput` moves off
  `ProfileBook` onto a dedicated `SettingsStore`. No user-visible behavior
  changes; this is an internal persistence refactor.

## Impact

- New `SettingsStore` (app persistence layer).
- `ProfileBook` — remove the `terminalSmartInput` piggyback field once
  migrated.
- Migration: existing installs' `terminalSmartInput` value (currently inside
  the personas blob) needs to carry over to the new store on first launch
  after upgrade.
