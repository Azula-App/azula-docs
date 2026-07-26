# mcp-bridge — delta

## MODIFIED Requirements

### Requirement: Stable Bridge Identity
The bridge SHALL derive its connectivity from the session-identity model: a stable machine identity key persisted at `~/.azula/machine.key` (adopting a pre-existing `~/.azula/bridge.key` unchanged, so pairing codes survive the migration) SHALL sign a per-process session certificate, and each bridge process SHALL bind its own session keypair rather than the machine key. `start_pairing` SHALL mint invites for the machine identity so a phone pairs with the machine once, not with an individual session.

#### Scenario: Restart preserves pairing code
- **WHEN** the machine's pairing invite is regenerated after a restart
- **THEN** it still names the same machine identity, so a previously paired phone needs no re-pairing

#### Scenario: Concurrent bridges do not collide
- **WHEN** two bridge processes run concurrently on one machine
- **THEN** each binds a distinct certified session key and both hold working conversations with the phone simultaneously

### Requirement: Live-Connection-Only Tools Fail Fast, Never Queue
`send_file` SHALL require a live connection (lazily redialed via a device-reachability check) and SHALL error immediately if the device is unreachable, rather than queuing. `render_ui`, `update_ui`, and `delete_ui` SHALL use the live connection when the device is reachable; when it is not, and a relay is known for the device, they SHALL coalesce into a full-surface snapshot delivered to the relay (per the relay capability) and report the surface as queued; with no relay known they SHALL error immediately as before.

#### Scenario: render_ui to an offline device with no relay
- **WHEN** `render_ui` is called for a device with no live stream, the redial fails, and no relay hint is known
- **THEN** the tool call returns an error and no frame is queued

#### Scenario: render_ui to an offline device with a relay
- **WHEN** `render_ui` is called for a device with no live stream and a relay hint is known
- **THEN** the surface snapshot is delivered to the relay and the tool reports it as queued for replay

#### Scenario: send_file never queues
- **WHEN** `send_file` targets an unreachable device, relay or not
- **THEN** the tool errors immediately and nothing is queued

### Requirement: send_message and say Have Mailbox Fallback
`send_message` and `say` SHALL be the only chat tools with offline store-and-forward, using the delivery chain: direct to the device first; the identity's relay second (appended there as an `agent_in` log entry keyed by the session); the local per-device JSONL mailbox last, only when no relay is known. In every fallback case the tool SHALL report the message as queued rather than failing.

#### Scenario: send_message to a disconnected device with a relay
- **WHEN** `send_message` targets an unreachable device and a relay hint is known
- **THEN** the message is delivered to the relay for sync-forwarding and the tool reports it as queued

#### Scenario: send_message with no relay known
- **WHEN** `send_message` targets an unreachable device and no relay hint is known
- **THEN** the text is appended to the device's local mailbox and the tool reports it as queued
