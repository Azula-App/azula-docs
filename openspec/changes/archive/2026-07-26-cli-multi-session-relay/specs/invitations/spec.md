# invitations — delta

## ADDED Requirements

### Requirement: Session Certificates Admit Strangers Without an Invite
The accept gate SHALL admit a connecting stranger with no invite and no pending prompt when its `Hello.cert` is a valid session certificate chaining to an already-paired machine: the cert self-verifies (signature by its `root_pk`, unexpired), carries the session role flag, its `root_pk` equals a known machine contact's key, and its `device_pk` equals the transport peer node id. All five checks SHALL be required; a failure of any SHALL fall through to the ordinary invite verification path, never to an error that blocks the invite path.

#### Scenario: All checks pass
- **WHEN** a stranger's `Hello.cert` passes signature, expiry, session-flag, known-machine, and transport-binding checks
- **THEN** the peer is admitted as a known session and no pending request is created

#### Scenario: Expired session cert falls through
- **WHEN** a stranger presents a session cert that is expired but otherwise valid
- **THEN** the cert path does not admit it and the connection proceeds through invite verification as an ordinary stranger

### Requirement: Machine Pairing Shares a Relay Hint
When a machine pairing is accepted, the phone SHALL share a relay hint (its relay device's ticket, when one is enrolled) with the paired machine, and the CLI SHALL persist it per device in the registry so sessions can deliver to the relay when the phone is unreachable. Absence of a relay hint SHALL leave delivery behavior as it was (local mailbox fallback).

#### Scenario: Hint persisted at pairing
- **WHEN** a phone with an enrolled relay accepts a machine pairing
- **THEN** the machine's registry entry for that phone records the relay ticket
