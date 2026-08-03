# Invitations Delta

## ADDED Requirements

### Requirement: Hello Carries an Optional Device Certificate
The `Hello` frame SHALL gain an optional `cert` field carrying the sender's encoded device certificate (`azd…`), included by certificate-holding peers on every ALPN in both directions. A receiver SHALL verify a presented certificate (signature against its embedded root key, version, expiry, and any known revocation) before using it; a certificate that fails verification SHALL be treated exactly as if the field were absent — it grants nothing and the connection proceeds through the existing stranger/invite path. Peers that omit the field SHALL continue to function with no version negotiation, exactly as the `invite` field does today.

#### Scenario: Valid certificate identifies the root
- **WHEN** a `Hello` arrives with a `cert` that verifies
- **THEN** the receiver associates the connection with the certificate's root public key in addition to the connection's endpoint id

#### Scenario: Invalid certificate is ignored, not fatal
- **WHEN** a `Hello` arrives with a `cert` whose signature does not verify
- **THEN** the receiver treats the frame as if `cert` were absent and applies the normal known-peer/invite gating to the connection

#### Scenario: Old peer omits the cert field
- **WHEN** a `Hello` frame from an older peer has no `cert` field
- **THEN** the receiving peer processes the frame without error and treats the sender as a single-device, endpoint-id-keyed peer

### Requirement: Contacts Pin the Root Identity
Accepting a peer that presented a valid device certificate SHALL record the certificate's root public key as the contact identifier, alongside the endpoint id of the accepted device. The contact's conversation SHALL be keyed by root public key, so messages from any certified device of that identity land in one conversation. Contacts without certificates SHALL remain keyed by endpoint id with unchanged behavior.

#### Scenario: Second device lands in the same conversation
- **WHEN** a contact's laptop (a different endpoint id, same root, valid certificate) dials after their phone was accepted
- **THEN** its messages appear in the existing conversation for that contact rather than creating a new one

#### Scenario: Legacy contact stays endpoint-id keyed
- **WHEN** a peer that has never presented a certificate connects
- **THEN** its conversation and contact entry remain keyed by endpoint id exactly as before this change

## MODIFIED Requirements

### Requirement: Known Peers Bypass the Invite Gate
A connecting peer SHALL be allowed to connect without invite verification if it is already known: its endpoint id matches an enabled conversation, a saved peer entry, or the accepted-contacts list (CLI: a registered device); or it presented a valid device certificate whose root public key is in the accepted-contacts list. A revoked device's certificate SHALL NOT satisfy the root-match path, and a certificate that fails verification SHALL NOT contribute to being known.

#### Scenario: A previously accepted peer reconnects
- **WHEN** a peer whose endpoint id is in the acceptor's contacts reconnects
- **THEN** the connection SHALL be accepted without requiring an invite

#### Scenario: A contact's new device is known by root
- **WHEN** a device never seen before presents a valid certificate whose root key matches an accepted contact
- **THEN** the connection SHALL be accepted without requiring an invite

#### Scenario: Revoked device does not ride the root match
- **WHEN** a device presents a certificate for a known root but the acceptor holds a verified revocation for that device key
- **THEN** the connection SHALL NOT be treated as known and SHALL fall through to the stranger path

### Requirement: Pending Requests and Consumption
On the app, a stranger presenting a valid invite SHALL become a persisted pending request rather than an active conversation, until the user explicitly accepts or declines. Accepting SHALL add the peer to contacts — recording the root public key as the contact identifier when the stranger presented a valid device certificate, and the endpoint id otherwise — and, if the invite is single-use, mark it consumed. Declining SHALL close the connection and discard the pending request. On the CLI, verification success SHALL constitute acceptance and SHALL register the device (with its root key when certified) immediately, with no pending step.

#### Scenario: User declines a pending stranger
- **WHEN** the user declines a pending request from a stranger who
  presented a valid invite
- **THEN** the connection SHALL be closed and no contact or conversation
  SHALL be created

#### Scenario: Accepting a certified stranger pins the root
- **WHEN** the user accepts a pending stranger whose `Hello` carried a valid certificate
- **THEN** the contact is recorded by root public key, and that identity's other certified devices are subsequently known
