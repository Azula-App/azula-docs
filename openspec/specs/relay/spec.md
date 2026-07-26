# relay Specification

## Purpose
TBD - created by archiving change cli-multi-session-relay. Update Purpose after archive.
## Requirements
### Requirement: Relay Subsumes the Mailbox Role
`azula relay` SHALL serve the always-on identity role previously provided by `azula mailbox` (which SHALL remain as an alias): a linked sibling device retaining the identity's full logs, reachable at any time, serving the chat, sync, and link ALPNs, with the existing mailbox role bit as its wire-level role value. Enrollment SHALL be `azula link --relay` (`--mailbox` kept as an alias).

#### Scenario: Existing mailbox deployments unaffected
- **WHEN** an operator upgrades a machine running `azula mailbox`
- **THEN** the command keeps working as an alias of `azula relay` with the same identity, role bit, and stored logs

### Requirement: Relay Carries Agent Chat
When a session cannot reach the phone directly, it SHALL deliver agent chat to the identity's relay instead; the relay SHALL admit a session by the same certificate gate the phone applies (session cert chaining to a machine root that is a known contact of the identity) and SHALL append the message to its own log as an `agent_in` entry keyed by the session's public key, so the phone receives it via sync — live-pushed if a sync connection is open, or on next catch-up otherwise.

#### Scenario: Laptop asleep, message still delivered
- **WHEN** a session sends a message while the phone is unreachable, delivers it to the relay, and the sending machine then goes offline before the phone returns
- **THEN** the phone still receives the message from the relay on its next sync

#### Scenario: Uncertified stranger refused by the relay
- **WHEN** a process without a valid session cert chaining to a known machine contact dials the relay's chat ALPN
- **THEN** it is not admitted via the session gate and falls through to the ordinary invite path

### Requirement: Session Delivery Order
A session's delivery chain for queueable traffic SHALL be: direct to the target device first; the identity's relay second; the local per-device JSONL mailbox last (only when no relay is known). Sessions SHALL learn the relay's ticket from a relay hint the phone shares at machine pairing time, persisted per device in the registry.

#### Scenario: Relay preferred over local queue
- **WHEN** the phone is unreachable and a relay hint is known
- **THEN** the message goes to the relay and is not written to the local JSONL mailbox

#### Scenario: No relay configured
- **WHEN** the phone is unreachable and no relay hint is known
- **THEN** the message queues in the local JSONL mailbox exactly as before this change

### Requirement: Relay Holds A2UI Snapshots Outside the Log
The relay SHALL keep a bounded side store of A2UI state — the latest snapshot per `(conversation, surface_id)`, holding the full component tree and data model, at most 256 KiB per surface, with a tombstone representing deletion — and SHALL NOT write A2UI state into the hash-chained identity log. A session that cannot reach the phone SHALL coalesce its `render_ui`/`update_ui`/`delete_ui` calls into full-surface snapshots delivered to the relay, each overwriting that surface's previous snapshot.

#### Scenario: Card game updates coalesce
- **WHEN** a session issues ten `update_ui` calls against one surface while the phone is offline
- **THEN** the relay stores one snapshot (the latest), not ten log entries

#### Scenario: Oversized snapshot rejected
- **WHEN** a snapshot exceeds the per-surface size cap
- **THEN** the relay rejects it and the session receives an error rather than silent truncation

### Requirement: A2UI Snapshot Replay on Reconnect
When the phone connects to the relay, pending A2UI snapshots SHALL replay to the phone as ordinary A2UI wire messages (createSurface/updateComponents/updateDataModel, or deleteSurface for a tombstone) after sync catch-up completes, and SHALL then be cleared from the relay's pending set for that device.

#### Scenario: Surface rendered while phone was offline appears on return
- **WHEN** the phone comes online and syncs with the relay after a session rendered a surface offline
- **THEN** the surface appears in the session's conversation in its latest state

#### Scenario: Deleted surface does not reappear
- **WHEN** a session rendered then deleted a surface while the phone was offline
- **THEN** the phone receives the deletion outcome (no surface), not the stale render

### Requirement: Terminal Traffic Is Never Relayed
Interactive terminal traffic SHALL always run over a direct session↔device connection and SHALL NOT be queued to or forwarded through the relay.

#### Scenario: Terminal against an offline phone
- **WHEN** the phone is unreachable and a terminal session is hosted
- **THEN** the session waits for a direct connection; nothing terminal-related is sent to the relay

