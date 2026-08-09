## MODIFIED Requirements

### Requirement: send_message and say Have Mailbox Fallback
`send_message` and `say` SHALL be the only chat tools with offline store-and-forward, using the delivery chain: direct to the device first; the identity's relay second (appended there as an `agent_in` log entry keyed by the session); the local per-device JSONL mailbox last, only when no relay is known. In every fallback case the tool SHALL report the message as queued rather than failing.

A message SHALL NOT be reported as sent on the strength of a completed local write alone. Direct delivery SHALL count as sent only while the peer's stream remains live; a peer that has closed the stream — as an app does when the session is still in its pending-approval queue — SHALL NOT yield a success report. Such a message SHALL enter the same delivery chain, and where the CLI has established that the peer closed the connection rather than merely being unreachable, that SHALL be reported distinctly from an offline queue.

A connection whose reader has ended SHALL be marked disconnected, so subsequent sends, `status`, and `watch` reflect that the peer hung up rather than continuing to show it as connected.

#### Scenario: Peer closes the stream pending approval
- **WHEN** `send_message` targets a device whose app closed the stream because the session is awaiting approval on the phone
- **THEN** the message is not reported as sent, and it enters the delivery chain for later delivery

#### Scenario: Refused is distinguishable from offline
- **WHEN** a caller compares a send to a peer that closed the connection against a send to a peer that is simply unreachable
- **THEN** the two are reported as different outcomes, not collapsed into one

#### Scenario: Hung-up peer is no longer shown connected
- **WHEN** a connected device's stream ends
- **THEN** that device is marked disconnected, and `status` and `watch` reflect that

#### Scenario: send_message to a disconnected device with a relay
- **WHEN** `send_message` targets an unreachable device and a relay hint is known
- **THEN** the message is delivered to the relay for sync-forwarding and the tool reports it as queued

#### Scenario: send_message with no relay known
- **WHEN** `send_message` targets an unreachable device and no relay hint is known
- **THEN** the text is appended to the device's local mailbox and the tool reports it as queued
