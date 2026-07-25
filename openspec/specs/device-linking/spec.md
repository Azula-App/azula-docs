# Device Linking Specification

## Purpose
Defines the device-certificate layer: how a root identity key issues
certificates binding device keys to itself, how devices present and verify
them, how owners revoke them, the QR-link and recovery-phrase enrollment flows
by which a new device joins an identity, and the registry each device keeps.

## Requirements

### Requirement: Device Certificates Bind Device Keys to a Root Identity
A device certificate SHALL be a fixed big-endian binary payload: a 1-byte version (`0x01`); a 1-byte roles field (bit 0 = mailbox, bit 1 = bot — reserved, never set by this change — bits 2–7 reserved, `0` on encode and ignored on decode); the 32-byte root public key; the 32-byte device public key; a 4-byte `issued_at` (u32 unix seconds); a 4-byte `expires_at` (u32 unix seconds, `0` meaning never); a 1-byte `name_len` (0–63); `name_len` bytes of UTF-8 display name; and a trailing 64-byte Ed25519 signature by the root secret over all preceding bytes. The encoded form SHALL be the literal prefix `"azd"` followed by unpadded, lowercase RFC 4648 base32 of the payload.

#### Scenario: Round-trip encode/decode
- **WHEN** a certificate is encoded to its `azd…` form and decoded back
- **THEN** every field survives byte-for-byte and the signature still verifies

#### Scenario: Truncated payload is rejected
- **WHEN** a decoded payload is shorter than `75 + name_len + 64` bytes or `name_len` exceeds 63
- **THEN** decoding SHALL reject the certificate rather than partially processing it

### Requirement: Certificate Verification Is Self-Contained
Verifying a certificate SHALL require no external lookup: check `version == 1`, verify the signature against the embedded root public key, and check `expires_at` is `0` or in the future. Verifiers SHALL additionally reject any certificate whose device key appears in a verified revocation statement they hold. A certificate is an association claim only — it SHALL confer nothing unless the connection's transport node id equals the certificate's device public key.

#### Scenario: Certificate presented over the wrong connection
- **WHEN** a valid certificate arrives on a connection whose transport node id differs from the certificate's device public key
- **THEN** the certificate SHALL confer no identity association on that connection

#### Scenario: Expired certificate
- **WHEN** a certificate's `expires_at` is nonzero and in the past
- **THEN** verification SHALL fail

### Requirement: Revocation Statements Invalidate Certificates
A revocation statement SHALL be a fixed big-endian payload — version (`0x01`, 1 byte), root public key (32 bytes), revoked device public key (32 bytes), `revoked_at` (4-byte u32 unix seconds), and a 64-byte Ed25519 signature by the root secret over all preceding bytes — encoded as `"azr"` plus unpadded lowercase base32. A verified revocation SHALL permanently invalidate the named device's certificates for that root regardless of `expires_at`. Revoking SHALL append a `device_revoke` log entry so the identity's own devices enforce it on next sync, and devices SHALL include their identity's current revocation set in the identity bundle and sync exchanges so contacts learn it when they next connect.

#### Scenario: Own devices enforce revocation after sync
- **WHEN** a device syncs a `device_revoke` entry naming a sibling device
- **THEN** it thereafter refuses sync and known-peer treatment for that device key

#### Scenario: Contact learns of revocation on next connect
- **WHEN** a contact's device connects to any of the identity's devices after a revocation was issued
- **THEN** it receives the revocation statement and thereafter rejects the revoked device

### Requirement: QR-Link Enrollment Grants a Certificate Without Root Authority
Linking a new device via QR SHALL work as follows: the new device generates its node keypair and displays a link payload — version (`0x01`, 1 byte), device public key (32 bytes), `name_len` (1 byte) plus UTF-8 name, `ticket_len` (2 bytes) plus an opaque connect ticket — encoded as `"azl"` plus unpadded lowercase base32, as a QR and copyable string. A root-holding device scans it and dials the ticket on the `azula/link/0` ALPN, exchanging newline-delimited JSON frames `LinkHello{device_pk, name, roles}` then `LinkGrant{cert, bundle}` or `LinkReject{reason}`. Before granting, both devices SHALL display the same four verification words — the first 44 bits of `SHA-256(lower_pk || higher_pk)` (the two device public keys sorted bytewise ascending) read as four 11-bit BIP-39 wordlist indices — and the root-holding device SHALL require explicit user confirmation naming the device and any requested roles. The grant SHALL deliver the new certificate and an identity bundle (root public key, all known certificates, revocation set, contacts snapshot, and a mailbox hint when one exists). A QR-linked device SHALL NOT receive the root secret.

#### Scenario: Verification words match on both screens
- **WHEN** the link connection is established
- **THEN** both devices derive and display the same four words from their two device public keys, before any grant is possible

#### Scenario: Confirmation happens on the root-holding side
- **WHEN** the verification words are shown
- **THEN** only explicit confirmation on the root-holding device causes the `LinkGrant`; cancelling sends `LinkReject` and no certificate exists

#### Scenario: QR-linked device cannot enroll others
- **WHEN** a QR-linked device attempts an operation requiring the root secret (issuing a certificate or a revocation)
- **THEN** the operation is unavailable, because the device holds no root secret

### Requirement: Phrase Enrollment Grants Root Authority
A device enrolled by recovery phrase SHALL hold the root secret and full root authority: it SHALL self-issue its own device certificate, append `device_add`, and be able to issue certificates and revocation statements for the identity thereafter.

#### Scenario: Restored device can link further devices
- **WHEN** a device is enrolled via recovery phrase
- **THEN** it can subsequently act as the root-holding side of a QR-link enrollment

### Requirement: CLI Device Enrollment
The azula CLI SHALL provide `azula link [--name <name>] [--mailbox]`, which generates (or reuses) a persisted node key, prints the `azl…` link payload as a terminal QR and string, prints the four verification words when the link connection arrives, and persists the granted certificate and identity bundle. `--mailbox` SHALL request the mailbox role, which the root-holding device's confirmation UI SHALL display before granting. The linked CLI device SHALL hold no root secret and SHALL keep its identity separate from the CLI's other long-lived command identities.

#### Scenario: Linking the CLI as a mailbox
- **WHEN** `azula link --mailbox` is run and the app-side user confirms a certificate that carries the mailbox role bit
- **THEN** the CLI persists that certificate and subsequent `azula mailbox` runs serve the mailbox role for the identity

#### Scenario: Link without confirmation grants nothing
- **WHEN** the app-side user cancels at the verification step
- **THEN** the CLI receives `LinkReject` and persists no certificate

### Requirement: Device Registry Persistence
Each enrolled device SHALL persist: the root public key, the root secret iff phrase-enrolled, its own node key and certificate, all sibling certificates and revocation statements it has learned, and the mailbox hint. For each contact, devices SHALL persist the pinned root public key (or node id for legacy contacts) plus the last-seen certificate per contact device and any learned revocations for that root. All of it SHALL be reconstructable from the identity bundle plus log sync — losing this cache SHALL degrade to re-learning, never to identity loss.

#### Scenario: Registry cache loss is recoverable
- **WHEN** a device loses its registry cache but keeps its keys
- **THEN** re-syncing with any sibling restores certificates, revocations, and contacts without re-enrollment
