# device-linking — delta

## ADDED Requirements

### Requirement: Session Certificate Kind
The `azd…` certificate format SHALL support a session role flag distinguishing an ephemeral CLI session from sibling-device enrollment. A session certificate SHALL bind a session public key (`device_pk`) to a machine identity key (`root_pk`), SHALL carry an expiry (default 7 days), and SHALL NOT enroll its holder as a device of any multi-device identity: it grants conversation access to peers that have paired with the machine, nothing more — no sync participation, no log authorship in the paired identity, no link-granting authority.

#### Scenario: Session cert is not an identity device
- **WHEN** a peer holding only a session certificate attempts an `azula/sync/0` session with an identity device
- **THEN** the sync hello verification rejects it (its cert does not chain to that identity's root)

#### Scenario: Self-certified headless session
- **WHEN** a headless process mints a session key with itself as root (`device_pk == root_pk`) for scan-per-session pairing
- **THEN** the certificate is well-formed and verifiable, and admission still requires the user to redeem its invite from the phone
