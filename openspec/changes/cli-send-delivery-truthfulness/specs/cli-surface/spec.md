## MODIFIED Requirements

### Requirement: JSON Output Contracts
Every CLI verb SHALL support `--json` machine-readable output. `azula watch --json` SHALL stream one JSON object per line for each inbox event with a `type` field distinguishing at least `message`, `ui_event`, `file`, `connected`, and `disconnected`, plus the source `device`; `ui_event` objects SHALL carry the A2UI event payload verbatim. `azula status --json` SHALL report the machine identity, known devices with connected state, and active local sessions.

`azula message send --json` SHALL report a `status` distinguishing a message delivered to a live peer, a message queued for later delivery, and a message the peer refused by closing the connection. A caller SHALL be able to tell those three apart without parsing human-readable text, and the refused case SHALL NOT be reported with the delivered status.

#### Scenario: Script distinguishes delivery outcomes
- **WHEN** a script runs `azula message send --json` against a device that closed the connection pending approval
- **THEN** the emitted object's `status` marks the message as not delivered, distinct from both the delivered and the offline-queued statuses

#### Scenario: Blackjack-style script loop
- **WHEN** a script runs `azula ui render` and then follows `azula watch --json`
- **THEN** a tap on the rendered surface arrives as a parseable JSONL `ui_event` line carrying the A2UI event payload
