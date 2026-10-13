## ADDED Requirements

### Requirement: A Long-Lived Session Keeps Its Devices Connected

A long-lived session (an `azula mcp` bridge, a terminal host) SHALL notice
when a device's connection ends — on either the dialing or the accepting side —
and SHALL then treat that device as disconnected everywhere it reports state
(`list_devices`, `status`, the runtime state file) and on the next send.

While the session runs it SHALL keep trying to reconnect every known device
that is not connected, without waiting for anything to be sent: a device seen
down SHALL be redialed promptly and then with backoff capped at one minute, so
that a device that becomes reachable again is reconnected within about a
minute. A device with mail queued SHALL be retried at least as often as the
mailbox redelivery cadence. Each reconnect SHALL perform the same handshake as
the session's first dial — `Hello` with the session certificate, thinking
cleared, queued mail flushed — so the phone re-admits the session and shows
its conversation as online.

At most one dial to a device SHALL be in flight at a time; a caller that needs
the device while a dial is in flight SHALL wait for that dial and share its
result rather than starting another. A device the operator explicitly
disconnected SHALL NOT be redialed in the background until something is next
sent to it. A one-shot invocation SHALL NOT be delayed by this maintenance, and
it SHALL stop when the session ends.

A registry row holding a bare endpoint id (how a device that paired by dialing
in is recorded) SHALL be dialable by that id, and SHALL match its device when
the device reconnects.

#### Scenario: Dropped connection comes back without a send

- **WHEN** a paired phone's connection to a running session drops and the
  phone is reachable again
- **THEN** the session reconnects within about a minute, sends its `Hello` with
  certificate, and the phone shows the conversation online — with nothing sent
  in between

#### Scenario: Device unreachable at startup

- **WHEN** a session starts while a known device is unreachable, and the device
  later becomes reachable
- **THEN** the session reconnects it without any tool call

#### Scenario: Restarted session reaches an invite-paired phone

- **WHEN** a session restarts whose phone paired by dialing in (registered under
  its bare endpoint id)
- **THEN** the session dials the phone by that id and reconnects it

#### Scenario: Concurrent callers share one dial

- **WHEN** several sends need a disconnected device at once
- **THEN** exactly one dial is made and every caller uses its result

#### Scenario: Explicit disconnect is respected

- **WHEN** the operator disconnects a device
- **THEN** the session does not redial it in the background until something is
  next sent to it

## MODIFIED Requirements

### Requirement: Offline Mailbox Storage and Flush Ordering
Mailbox frames SHALL be appended as JSONL to a per-device file, capped at
1000 frames with the oldest entries trimmed on overflow. Queued frames SHALL
flush immediately after any successful dial — whether the bridge dials out or
a device dials in — before the send stream is handed to the tool layer. A
flush SHALL clear the mailbox file only once every queued frame has written
successfully. A disconnected device with mail pending SHALL be retried by the
session's presence maintenance (see "A Long-Lived Session Keeps Its Devices
Connected") at least as often as the mailbox redelivery cadence.

#### Scenario: Reconnect flushes backlog first
- **WHEN** a previously offline device reconnects
- **THEN** its queued mailbox frames are delivered before any new
  tool-initiated frame reaches it

#### Scenario: Partial flush failure leaves mailbox intact
- **WHEN** a flush attempt fails partway through writing queued frames
- **THEN** the mailbox file is left intact so the next attempt can retry the
  same backlog

### Requirement: Structured Inbound Drain via get_events

The bridge SHALL expose a `get_events` tool: a drain of a device's inbox that
returns one structured object per event rather than one rendered line. Each
object SHALL carry a `type` distinguishing at least `message`, `ui_event`,
`file`, `connected`, and `disconnected`, and SHALL name the source `device`; a
`ui_event` SHALL carry its A2UI event payload verbatim, and a `file` SHALL
carry the attachment's facts rather than a rendered notice. The event
vocabulary SHALL match `azula watch --json`'s, so a consumer can move between
the two without re-learning the shape.

`connected` SHALL be emitted whenever a device goes from down to up — whether
the session dialed it or it dialed in, including a device seen for the first
time — and `disconnected` whenever its connection ends or it is explicitly
disconnected. A device's inbox SHALL survive reconnects, so a waiting drain is
never stranded on a replaced queue. Without a device filter, a waiting drain
SHALL also pick up a device that appears while it waits.

`get_events` SHALL support both drain modes the existing text tools provide
separately, selected by an optional timeout: with no timeout it SHALL drain
whatever is pending and return immediately, and with a timeout it SHALL wait
for the inbox to become non-empty before draining, returning an empty result if
the timeout elapses first. A structured consumer SHALL therefore not need to
combine it with `wait_for_reply`, which drains the same inbox as text and would
consume the events before they could be read structurally.

`get_messages` and `wait_for_reply` SHALL remain the human- and LLM-readable
drains; they SHALL discard `connected`/`disconnected` entries, and
`wait_for_reply` SHALL NOT return on one. All of these tools SHALL share one
inbox: an event drained by any of them SHALL NOT be returned again by another.

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

#### Scenario: A phone that dials in is reported connected

- **WHEN** a phone pairs or reconnects by dialing in to the session
- **THEN** `get_events` reports a `connected` event naming it, and a
  `disconnected` event when that connection later ends

#### Scenario: Presence does not wake a text drain

- **WHEN** a device connects or disconnects while `wait_for_reply` is waiting
- **THEN** `wait_for_reply` keeps waiting for an actual reply
