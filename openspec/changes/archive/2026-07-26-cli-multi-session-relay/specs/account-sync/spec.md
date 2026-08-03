# account-sync — delta

## MODIFIED Requirements

### Requirement: Event Kinds
Log entry kinds SHALL be: `0x01 message_out` (body: `{conversation, text, id?}`), `0x02 message_in` (body: `{conversation, from_device_pk, text, id?}`), `0x03 read_marker` (body: `{conversation, up_to_lamport}`), `0x04 contact_add` (body: `{root_pk | endpoint_id, name?}`), `0x05 contact_remove` (body: same key as add), `0x06 device_add` (body: `{cert}`), `0x07 device_revoke` (body: `{revocation}`), `0x08 profile_update` (body: `{name?, description?}`), `0x09 agent_in` (body: `{conversation, text, id?, from_name?}`), `0x0A agent_out` (body: `{conversation, text, id?}`). For agent kinds, `conversation` SHALL be the session's public key in hex; agent kinds SHALL fold into that session's conversation history with the same `(conversation, id)` dedup rule as peer chat, and a device receiving a relayed `agent_in` for a new conversation SHALL surface it with its normal new-message notification path. A2UI surface state SHALL NOT be written to the log in any kind. `conversation` for peer kinds SHALL be the contact's root public key in hex, or endpoint id in hex for legacy contacts. Unknown kinds SHALL be stored, forwarded, and ignored at fold time so newer devices can extend the log without breaking older siblings.

#### Scenario: Unknown kind passes through
- **WHEN** a device receives an entry with an unrecognized kind byte from a newer sibling
- **THEN** it stores and re-serves the entry during sync but excludes it from its own derived state

#### Scenario: Relayed agent message folds into the session conversation
- **WHEN** the phone syncs an `agent_in` entry the relay logged while the phone was offline
- **THEN** the message appears in the conversation keyed by that session's public key and fires the normal message notification

#### Scenario: Agent retry deduplicates
- **WHEN** a session delivers a message directly and, after a timeout, retries the same `id` via the relay
- **THEN** the fold shows the message exactly once
