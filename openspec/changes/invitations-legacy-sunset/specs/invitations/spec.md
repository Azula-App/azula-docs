## MODIFIED Requirements

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

## ADDED Requirements

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
