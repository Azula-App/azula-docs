## ADDED Requirements

### Requirement: Terminal settings SHALL persist via a dedicated SettingsStore

Terminal-related settings (starting with `terminalSmartInput`) SHALL persist
through a dedicated `SettingsStore`, not by piggybacking on `ProfileBook` (the
personas blob).

#### Scenario: terminalSmartInput persists independently of personas

- **WHEN** a user toggles `terminalSmartInput` and relaunches the app
- **THEN** the value is read from `SettingsStore`, not from `ProfileBook`,
  and personas data contains no `terminalSmartInput` field

#### Scenario: Upgrading from a pre-SettingsStore install preserves the setting

- **WHEN** an existing install with `terminalSmartInput` stored in its
  personas blob launches after upgrading past this change
- **THEN** the value is migrated into `SettingsStore` on first launch and the
  user's prior choice is preserved
