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
A connecting peer SHALL be allowed to connect without invite verification
if it is already known — its node id matches an enabled conversation, a
saved peer entry, or the accepted-contacts list (CLI: a registered
device).

#### Scenario: A previously accepted peer reconnects
- **WHEN** a peer whose node id is in the acceptor's contacts reconnects
- **THEN** the connection SHALL be accepted without requiring an invite

### Requirement: Accept-Side Verification Checks
For a stranger, the acceptor SHALL read the first frame within a
15-second timeout and require a present `Hello.invite`. The invite SHALL
be treated as valid only if all of the following hold: the payload
decodes and `version == 1`; the ticket's embedded node id equals the
acceptor's own node id; `invite_id` exists in the acceptor's
issued-invite store; `expires_at` is `0` or the current time is before
`expires_at`; if flags bit 0 is set, the signature verifies against the
acceptor's node key; and if flags bit 1 is set, the invite has not
already been consumed. Any failure, or a missing invite where one is
required, SHALL cause the acceptor to close the connection.

#### Scenario: Invite addressed to a different node
- **WHEN** the node id embedded in a presented invite's ticket does not
  match the acceptor's own node id
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
On the app, a stranger presenting a valid invite SHALL become a
persisted pending request rather than an active conversation, until the
user explicitly accepts or declines. Accepting SHALL add the peer to
contacts and, if the invite is single-use, mark it consumed. Declining
SHALL close the connection and discard the pending request. On the CLI,
verification success SHALL constitute acceptance and SHALL register the
device immediately, with no pending step.

#### Scenario: User declines a pending stranger
- **WHEN** the user declines a pending request from a stranger who
  presented a valid invite
- **THEN** the connection SHALL be closed and no contact or conversation
  SHALL be created

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
When an inbound stranger presents no invite at all, the acceptor SHALL
close the connection by default, unless the `allowLegacyInbound` (app) /
`--allow-legacy` (CLI) setting is enabled, in which case the stranger
SHALL be routed into the pending inbox flagged "unverified" instead of
being closed.

#### Scenario: Legacy inbound allowed
- **WHEN** `allowLegacyInbound` is enabled and a stranger connects with no
  `Hello.invite`
- **THEN** the stranger SHALL appear as a pending request flagged
  "unverified" rather than the connection being closed

### Requirement: Wire Backward Compatibility
The `Hello` frame's `invite` field SHALL be optional in both directions:
older peers omitting or ignoring it, and newer peers receiving `Hello`
frames without it, SHALL both continue to function with no version
negotiation. Legacy share-link forms (`/s/<ticket>`, `/connect/<ticket>`,
`azula://connect?code=<ticket>`) SHALL continue to parse for outbound
dialing indefinitely.

#### Scenario: Old peer omits the invite field
- **WHEN** a `Hello` frame from an older peer has no `invite` field
- **THEN** the receiving peer SHALL process the frame without error,
  treating the sender as it would any invite-less stranger

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
