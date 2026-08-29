## ADDED Requirements

### Requirement: Structured Inbound Drain via get_events

The bridge SHALL expose a `get_events` tool: a drain of a device's inbox that
returns one structured object per event rather than one rendered line. Each
object SHALL carry a `type` distinguishing at least `message`, `ui_event`,
`file`, `connected`, and `disconnected`, and SHALL name the source `device`; a
`ui_event` SHALL carry its A2UI event payload verbatim, and a `file` SHALL
carry the attachment's facts rather than a rendered notice. The event
vocabulary SHALL match `azula watch --json`'s, so a consumer can move between
the two without re-learning the shape.

`get_events` SHALL support both drain modes the existing text tools provide
separately, selected by an optional timeout: with no timeout it SHALL drain
whatever is pending and return immediately, and with a timeout it SHALL wait
for the inbox to become non-empty before draining, returning an empty result if
the timeout elapses first. A structured consumer SHALL therefore not need to
combine it with `wait_for_reply`, which drains the same inbox as text and would
consume the events before they could be read structurally.

`get_messages` and `wait_for_reply` SHALL remain unchanged as the human- and
LLM-readable drains. All of these tools SHALL share one inbox: an event drained
by any of them SHALL NOT be returned again by another.

#### Scenario: A2UI tap arrives as structured data

- **WHEN** the user taps a control on an A2UI surface and `get_events` is
  called for that device
- **THEN** the result contains a `ui_event` object carrying the tap payload
  verbatim, not a rendered `ui-event: …` line

#### Scenario: Message text resembling a rendered marker stays a message

- **WHEN** the user sends chat text that looks like a rendered event line
- **THEN** `get_events` reports it as a `message` whose text is that literal
  string

#### Scenario: One inbox behind every drain

- **WHEN** `get_events` drains a device's inbox
- **THEN** a subsequent `get_messages` or `wait_for_reply` for that device does
  not return the same events again

#### Scenario: Waiting drain returns as soon as an event arrives

- **WHEN** `get_events` is called with a timeout against an empty inbox and the
  user then sends a message
- **THEN** the call returns that message as a structured event without waiting
  out the full timeout

#### Scenario: Waiting drain times out empty

- **WHEN** `get_events` is called with a timeout and no event arrives before it
  elapses
- **THEN** the call returns an empty result rather than an error

### Requirement: Bare Thinking State via set_typing

The bridge SHALL expose a `set_typing` tool taking a `device` and a boolean
state, which sends the conversation's thinking indicator on or off without
sending any message text. This SHALL make the indicator controllable outside
`send_message`'s streaming sequence, which is otherwise the only thing that
emits it.

`set_typing` SHALL require a live connection and SHALL error immediately when
the device is unreachable, rather than queuing to the relay or the local
mailbox — a stale typing indicator replayed later is misleading, and the state
it represents has no meaning once the turn that set it has ended.

#### Scenario: Indicator set before any text exists

- **WHEN** `set_typing` is called with the state on for a connected device
- **THEN** the conversation shows the thinking state, with no message text sent

#### Scenario: Indicator cleared

- **WHEN** `set_typing` is called with the state off
- **THEN** the conversation leaves the thinking state

#### Scenario: Offline device errors rather than queuing

- **WHEN** `set_typing` targets an unreachable device, relay known or not
- **THEN** the tool errors immediately and nothing is queued for later replay
