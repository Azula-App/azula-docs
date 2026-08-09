# Invitations Specification

## Purpose
Defines the invite payload, its share/link encodings, and the accept-side
trust and verification model that replaces bare iroh tickets — a
permanent bearer credential — with a revocable, time-bounded, optionally
single-use and signed credential that must be re-presented to its issuer
at connect time.
## Requirements
### Requirement: Issuer-Side Persistence Is Authoritative
Acceptance of an invite SHALL be gated solely by the issuer's own
persistent state: the invite id SHALL exist in the issuer's local
issued-invite store, SHALL NOT have been revoked (removed from that
store), SHALL NOT be expired, and SHALL NOT already be consumed if it is
single-use. A valid signature SHALL be necessary when present but SHALL
NOT by itself be sufficient for the issuer to accept.

#### Scenario: Revoked invite is rejected despite a valid signature
- **WHEN** an invite id has been deleted from the issuer's issued-invite
  store
- **THEN** a connecting stranger presenting that invite SHALL be rejected,
  even if its signature verifies and it has not expired

### Requirement: Invite Payload Layout
The invite payload SHALL be a fixed big-endian binary layout: a 1-byte
version (`0x01`); a 1-byte flags field (bit 0 = signed, bit 1 = single-use,
bits 2–7 reserved, must be `0` on encode and ignored on decode); an 8-byte
`invite_id`; a 4-byte `issued_at` (u32 unix seconds); a 4-byte
`expires_at` (u32 unix seconds, `0` meaning never expires); a 2-byte
`ticket_len`; `ticket_len` bytes of opaque ticket; and, iff flags bit 0 is
set, a trailing 64-byte Ed25519 signature computed over all preceding
bytes.

#### Scenario: Unsupported version is rejected
- **WHEN** a payload's version byte is not `0x01`
- **THEN** decoding SHALL reject the payload

#### Scenario: Signed flag set without a complete signature
- **WHEN** flags bit 0 is set but the payload is shorter than
  `20 + ticket_len + 64` bytes
- **THEN** decoding SHALL reject the payload as invalid

### Requirement: Encoding and Link Formats
An invite payload SHALL be encoded as the literal prefix `"azi"` followed
by unpadded, lowercase RFC 4648 base32 of the payload bytes. The canonical
share link SHALL be `https://azula.app/i/<encoded>`, with
`azula://i?c=<encoded>` and a bare `azi…` string accepted as equivalent
forms wherever an invite is pasted or scanned.

#### Scenario: Malformed encoded invite is rejected
- **WHEN** an encoded string fails to decode as valid base32, or its
  decoded structure is truncated or has a `ticket_len` overrun
- **THEN** it SHALL be rejected rather than partially processed

### Requirement: Invite Presentation on Connect
A redeeming peer SHALL send the full encoded invite string in the
`invite` field of every `Hello` frame it dials with to a peer it does not
yet know, and SHALL keep re-presenting it on auto-reconnect attempts
until the issuer has accepted it. Once accepted, the peer becomes known
and the invite SHALL be dropped from future `Hello` frames.

#### Scenario: Auto-reconnect before acceptance
- **WHEN** a redeemer's connection drops and it auto-reconnects before the
  issuer has accepted its pending request
- **THEN** the redeemer SHALL include the invite again in the new `Hello`

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

### Requirement: Accept-Side Verification Checks
For a stranger, the acceptor SHALL read the first frame within a
15-second timeout and require a present `Hello.invite`. The invite SHALL
be treated as valid only if all of the following hold: the payload
decodes and `version == 1`; the ticket's embedded endpoint id equals the
acceptor's own endpoint id; `invite_id` exists in the acceptor's
issued-invite store; `expires_at` is `0` or the current time is before
`expires_at`; if flags bit 0 is set, the signature verifies against the
acceptor's endpoint key; and if flags bit 1 is set, the invite has not
already been consumed. Any failure, or a missing invite where one is
required, SHALL cause the acceptor to close the connection.

#### Scenario: Invite addressed to a different endpoint
- **WHEN** the endpoint id embedded in a presented invite's ticket does not
  match the acceptor's own endpoint id
- **THEN** the acceptor SHALL treat the invite as invalid and close the
  connection

#### Scenario: Expired invite
- **WHEN** `expires_at` is nonzero and the current time is at or past
  `expires_at`
- **THEN** the acceptor SHALL treat the invite as invalid

#### Scenario: Single-use invite already consumed
- **WHEN** flags bit 1 is set and the invite has already been marked
  consumed
- **THEN** a subsequent connection attempt presenting that same invite
  SHALL be rejected

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

### Requirement: Guest Redemption
Redeeming an invite (by paste, scan, or deep link) SHALL NOT require the
redeemer to have a profile. Connecting as a guest SHALL be fully
supported, and sharing a persona SHALL be an optional step that never
blocks the connection.

#### Scenario: Redeeming without a profile
- **WHEN** a user with no configured profile pastes or scans an invite
- **THEN** the connection SHALL proceed as a guest without requiring
  profile setup first

### Requirement: Legacy Inbound Transition
The acceptor SHALL close the connection when an inbound stranger
presents no invite at all, or an invalid one. The `allowLegacyInbound` (app)
and `--allow-legacy` (CLI) escape hatches SHALL be removed; no setting
SHALL admit an invite-less stranger into a pending/unverified inbox.

#### Scenario: Stranger connects without an invite
- **WHEN** a peer that is not known (no matching enabled conversation,
  saved peer entry, or contacts entry) connects and its first `Hello`
  frame has no `invite` field, or an invalid one
- **THEN** the connection SHALL be closed; no pending request or
  "unverified" inbox entry SHALL be created

### Requirement: Wire Backward Compatibility
The `Hello` frame's `invite` field SHALL be optional in both directions:
older peers omitting or ignoring it, and newer peers receiving `Hello`
frames without it, SHALL both continue to function with no version
negotiation. Legacy share-link forms (`/s/<ticket>`, `/connect/<ticket>`,
`azula://connect?code=<ticket>`) SHALL NOT be parsed for outbound
dialing; only the current invite-payload formats
(`https://azula.app/i/<encoded>`, `azula://i?c=<encoded>`, bare `azi…`)
SHALL be accepted.

#### Scenario: Old peer omits the invite field
- **WHEN** a `Hello` frame from an older peer has no `invite` field
- **THEN** the receiving peer SHALL process the frame without error,
  treating the sender as it would any invite-less stranger

#### Scenario: A legacy link is pasted or opened
- **WHEN** a user pastes or opens a `https://azula.app/s/<ticket>`,
  `/connect/<ticket>`, or `azula://connect?code=<ticket>` link in the
  app, the CLI, or on `azula-site`
- **THEN** it SHALL be treated as unrecognized input, not parsed into a
  dialable ticket

### Requirement: Store Persistence
Issued invites SHALL be persisted with at minimum `{id, createdAt,
expiresAt, flags, consumed}`. The app SHALL additionally persist pending
(unaccepted) invite requests and its accepted-contacts list. The CLI
SHALL persist issued invites under a per-identity store, kept separate
from other persisted identities (e.g. the `serve` identity's invites are
distinct from the `serve-mcp`/bridge identity's).

#### Scenario: Invite minted for the wrong identity
- **WHEN** an invite is minted for the `serve` identity but presented to
  the bridge (`serve-mcp`) identity, or vice versa
- **THEN** verification SHALL fail because the `invite_id` does not exist
  in that identity's issued-invite store

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

### Requirement: Session Certificates Admit Strangers Without an Invite
The accept gate SHALL admit a connecting stranger with no invite and no pending prompt when its `Hello.cert` is a valid session certificate chaining to an already-paired machine: the cert self-verifies (signature by its `root_pk`, unexpired), carries the session role flag, its `root_pk` equals a known machine contact's key, and its `device_pk` equals the transport peer endpoint id. All five checks SHALL be required; a failure of any SHALL fall through to the ordinary invite verification path, never to an error that blocks the invite path.

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

### Requirement: Invite Page Signature Verification
The `/i/` invite page on `azula-site` SHALL verify the Ed25519 signature
of a signed invite payload (parsing the endpoint id out of the
postcard-encoded ticket) before displaying a "signed" badge, rather than
trusting the payload's signed-flag bit alone.

#### Scenario: A signed invite is viewed on the invite page
- **WHEN** a user opens an `/i/<encoded>` link whose payload has the
  signed flag set
- **THEN** the page SHALL decode the embedded ticket to recover the
  issuer's endpoint id, verify the Ed25519 signature against it, and show
  the "signed" badge only if verification succeeds

#### Scenario: A signed invite with a tampered signature is viewed
- **WHEN** a user opens an `/i/<encoded>` link whose payload has the
  signed flag set but the signature does not verify against the embedded
  ticket's endpoint id
- **THEN** the page SHALL NOT show the "signed" badge
