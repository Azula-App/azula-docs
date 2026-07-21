## MODIFIED Requirements

### Requirement: Restore Flow Replaces the Identity In Place
A valid pasted recovery phrase SHALL commit immediately on restore with no second confirmation step, persisting the new key and rebinding the transport in place without an app restart. An invalid phrase SHALL leave the existing identity unchanged and show an inline error. The previous key SHALL be overwritten, not archived. A failed re-bind SHALL NOT propagate out of the restore call — the key is persisted before the re-bind, so the restore has committed and SHALL be reported as successful, with the transport degrading to offline exactly as a failed initial bind does. A successful restore SHALL leave the transport able to accept inbound connections without an app restart.

#### Scenario: Valid restore
- **WHEN** a valid 24-word phrase is submitted to restore
- **THEN** the key is persisted, the transport tears down and rebinds in
  place, and the node id/connect ticket reflect the new identity without
  restarting the app

#### Scenario: Invalid restore attempt
- **WHEN** an invalid phrase is submitted to restore
- **THEN** the existing identity is left unchanged and an inline error is
  shown

#### Scenario: Old key unrecoverable after restore
- **WHEN** a restore succeeds
- **THEN** the previous key is overwritten and is not recoverable unless it
  was separately backed up beforehand

#### Scenario: Re-bind fails during restore
- **WHEN** a phrase decodes successfully but the transport cannot re-bind
- **THEN** the restore SHALL report success and the app SHALL degrade to
  offline rather than terminate, and SHALL NOT report the phrase as invalid

#### Scenario: Inbound still accepted after restore
- **WHEN** a restore succeeds and a peer subsequently dials the device
- **THEN** the connection SHALL be accepted against the newly bound endpoint,
  with no app relaunch required
