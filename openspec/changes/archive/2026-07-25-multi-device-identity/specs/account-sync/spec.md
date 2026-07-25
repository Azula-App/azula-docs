# Account Sync Delta

## ADDED Requirements

### Requirement: Per-Device Append-Only Signed Logs
Each enrolled device SHALL own exactly one append-only log of which it is the single writer. A log entry SHALL be a fixed big-endian payload: version (`0x01`, 1 byte); kind (1 byte); the author device public key (32 bytes); `seq` (8-byte u64, first entry `1`, strictly incremented by 1); `lamport` (8-byte u64, one greater than the highest lamport the device has seen anywhere at append time); `ts_ms` (8-byte u64 unix milliseconds, display only); `prev_hash` (32 bytes, the SHA-256 of the previous entry's full bytes, all zeros at `seq` 1); `body_len` (4-byte u32); `body_len` bytes of UTF-8 JSON body; and a trailing 64-byte Ed25519 signature by the device key over all preceding bytes. Entries SHALL be immutable once appended; receivers SHALL reject an entry whose signature, seq continuity, or `prev_hash` chain fails against what they already hold for that device.

#### Scenario: Broken chain is rejected
- **WHEN** a received entry's `prev_hash` does not equal the SHA-256 of the previously accepted entry for that device
- **THEN** the receiver rejects it and does not advance its cursor for that device

#### Scenario: Single writer never forks
- **WHEN** two sibling devices append concurrently
- **THEN** each appends to its own log and no conflict or merge arises anywhere

### Requirement: Event Kinds
Log entry kinds SHALL be: `0x01 message_out` (body: `{conversation, text, id?}`), `0x02 message_in` (body: `{conversation, from_device_pk, text, id?}`), `0x03 read_marker` (body: `{conversation, up_to_lamport}`), `0x04 contact_add` (body: `{root_pk | node_id, name?}`), `0x05 contact_remove` (body: same key as add), `0x06 device_add` (body: `{cert}`), `0x07 device_revoke` (body: `{revocation}`), `0x08 profile_update` (body: `{name?, description?}`). `conversation` SHALL be the contact's root public key in hex, or node id in hex for legacy contacts. Unknown kinds SHALL be stored, forwarded, and ignored at fold time so newer devices can extend the log without breaking older siblings.

#### Scenario: Unknown kind passes through
- **WHEN** a device receives an entry with an unrecognized kind byte from a newer sibling
- **THEN** it stores and re-serves the entry during sync but excludes it from its own derived state

### Requirement: Sync Runs Only Between Same-Root Certified Devices
The `azula/sync/0` ALPN SHALL exchange newline-delimited JSON frames and SHALL begin with mutual `SyncHello{cert}`; each side SHALL verify the other's certificate chains to its own root key and that the transport node id matches the certificate's device key, closing the connection otherwise. Both sides then send `SyncVector{vector}` — a map of device public key hex to highest contiguous `seq` held — then stream `SyncEntries{entries}` (base64 entry payloads, at most 64 per frame, per-device in ascending `seq` order) for entries the other side lacks, then `SyncAck{vector}`. While the connection stays open, each side SHALL push newly appended entries immediately.

#### Scenario: Foreign device is refused
- **WHEN** a `SyncHello` presents a certificate for a different root key
- **THEN** the connection is closed before any vector or entry is exchanged

#### Scenario: Catch-up transfers only the gap
- **WHEN** two siblings connect and one's vector already covers most entries
- **THEN** only entries above the received vector's per-device seqs are transmitted

#### Scenario: Live push while connected
- **WHEN** a device appends an entry while a sync connection is open
- **THEN** the entry is pushed to the connected sibling without waiting for a new vector exchange

### Requirement: Derived State Is a Deterministic Fold
Message history, contacts, device set, read state, and profile SHALL be derived deterministically from the union of the identity's logs, ordered by `(lamport, ts_ms, device_pk)` ascending. Contact membership SHALL resolve add/remove by the highest-ordered entry for that contact key; profile fields SHALL be last-writer-wins by the same order; the device set SHALL be the union of `device_add` certificates minus verified revocations. Any device SHALL be able to rebuild its entire derived state from the raw logs alone.

#### Scenario: Same logs, same state
- **WHEN** two siblings hold the same set of entries
- **THEN** their derived conversations, contacts, read state, and profile are identical

#### Scenario: Projection rebuild
- **WHEN** a device's derived stores are deleted but its logs remain
- **THEN** replaying the logs reproduces the same derived state

### Requirement: Delivery to Any Device Counts for the Identity
When sending to a contact with known device certificates, a sender SHALL dial the contact's devices — most recently seen first, then any mailbox-role device — and SHALL treat the first successful delivery as delivered to the identity. The receiving device SHALL append `message_in` so siblings converge via sync. Outbound sends SHALL be recorded as `message_out` on the sending device's log regardless of delivery outcome, and undelivered sends SHALL retry with the existing reconnect behavior until some device of the contact accepts.

#### Scenario: Phone offline, mailbox receives
- **WHEN** a contact's interactive devices are unreachable but their mailbox device accepts the connection
- **THEN** the message is delivered to the mailbox, and the contact's other devices receive it from the mailbox via sync when next online

#### Scenario: Send while every recipient device is down
- **WHEN** no device of the contact is reachable
- **THEN** the sender's `message_out` is logged, the send retries in the background, and the sender's own siblings still see the pending message via sync

### Requirement: Mailbox Role Stores and Forwards
A device whose certificate carries the mailbox role SHALL be a full sibling with durability duties: it SHALL retain the identity's complete logs, accept inbound peer connections at any time, and serve as the bootstrap source for newly enrolled devices. The azula CLI SHALL provide `azula mailbox`, a long-running command that serves this role for a linked identity. The CLI bridge's existing per-device JSONL mailbox SHALL remain unchanged for bridge tooling; identity-level offline delivery for peer chat SHALL NOT depend on it.

#### Scenario: Mailbox bridges two never-overlapping devices
- **WHEN** an identity's phone and laptop are never online simultaneously but both reach the mailbox
- **THEN** entries authored on each still converge on the other through the mailbox's copy of the logs

### Requirement: New Device Bootstrap Replays the Logs
A newly enrolled device SHALL send an empty sync vector and receive the identity's full logs from whichever sibling it reaches first, preferring the mailbox hint from its identity bundle. The UI SHALL become usable progressively as entries fold in rather than blocking on full replay.

#### Scenario: Bootstrap from the mailbox
- **WHEN** a just-linked device comes online with only the mailbox reachable
- **THEN** it receives the full history from the mailbox and converges without any interactive sibling online

### Requirement: Chat Message Ids Deduplicate Retries
The `Chat` frame SHALL gain an optional `id` field (16 random bytes, lowercase hex) set by senders on new messages. Receivers folding `message_in` entries SHALL deduplicate by `(sender root or node id, id)` so a retry delivered to a second device after an ambiguous failure appears once. Frames without `id` SHALL never be deduplicated.

#### Scenario: Ambiguous failure then retry to another device
- **WHEN** a sender times out delivering to one device and retries the same `id` against a sibling, but the first delivery had actually succeeded
- **THEN** both deliveries are logged by their receiving devices, and every sibling's fold shows the message exactly once

### Requirement: Read State Syncs as Log Entries
Marking a conversation read SHALL append a `read_marker` entry; a conversation's unread count on any device SHALL be derived from messages ordered after the identity's highest-ordered `read_marker` for that conversation. No other read-state channel SHALL exist.

#### Scenario: Read on the laptop clears the phone badge
- **WHEN** a conversation is read on one device and the `read_marker` entry syncs
- **THEN** sibling devices show the conversation as read up to that point

### Requirement: Legacy Peers Are Unaffected
Sync SHALL be internal to an identity: peers without certificates SHALL see only the existing chat/invite/media protocols, node-id-keyed conversations, and no sync traffic. An identity's own devices SHALL still log and sync `message_in`/`message_out` for conversations with legacy peers, so multi-device history works even when the peer runs an old build.

#### Scenario: Old peer, synced history
- **WHEN** a legacy single-device peer chats with a multi-device identity
- **THEN** the legacy peer's experience is unchanged while the identity's devices all converge on the conversation history
