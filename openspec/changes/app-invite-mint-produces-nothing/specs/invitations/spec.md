## ADDED Requirements

### Requirement: Minting Yields a Usable Invite or an Error
Completing an issuer's create-invite flow SHALL leave the user holding an
invite they can hand to a peer, or SHALL tell them why not. A flow that
dismisses as though it succeeded while producing nothing the user can obtain
SHALL NOT be considered a successful mint.

A minted invite SHALL be recorded in the issuer's own issued-invite store at
mint time, so that "Issuer-Side Persistence Is Authoritative" can gate its
redemption and so that revoking it has a record to remove. An invite that the
issuer cannot later recognise SHALL NOT be presented to the user as usable.

The invite SHALL be obtainable as the `https://azula.app/i/…` link in a form
the user can transfer to another device — copyable text, a scannable code, or
a share affordance — not merely rendered where it cannot be extracted.

#### Scenario: Completing the create-invite flow
- **WHEN** a user completes an issuer's create-invite flow with any
  combination of expiry, signing, and single-use options
- **THEN** they are left holding the invite link in a form they can give to a
  peer, and the issuer has recorded it in its issued-invite store

#### Scenario: A mint that cannot complete
- **WHEN** the invite cannot be minted or cannot be persisted
- **THEN** the user is told the mint failed, and the flow does not dismiss as
  though an invite had been created

#### Scenario: A minted invite is redeemable
- **WHEN** a peer presents an invite that an issuer's own create-invite flow
  produced, within its expiry and before revocation
- **THEN** the issuer recognises it against its issued-invite store and does
  not reject it as unknown
