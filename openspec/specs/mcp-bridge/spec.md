# Mcp-Bridge Specification

## Purpose
Defines the contract of `azula-cli`'s `AzulaBridge`: an MCP server that gives
an LLM client tools to manage azula-app device sessions and peer-bridge
conversations over iroh, including its tool catalog, pairing flow, device
registry, offline mailbox, file transfer, and A2UI tool behavior.

## Requirements

### Requirement: Bridge Entry Points Share One Core
`azula serve-mcp` (streamable HTTP) and `azula mcp` (stdio JSON-RPC) SHALL both run through the same bridge setup core, differing only in transport; `azula serve-mcp` SHALL mount at `/mcp` and default to bind `127.0.0.1:8765`. The stdio entrypoint SHALL write all logging and the startup banner to stderr, never stdout, since stdout carries the JSON-RPC channel.

#### Scenario: stdio logging stays off stdout
- **WHEN** `azula mcp` starts
- **THEN** tracing output and the startup banner go to stderr so stdout
  remains a clean JSON-RPC stream

#### Scenario: HTTP bind default
- **WHEN** `azula serve-mcp` starts without `--bind`
- **THEN** it binds `127.0.0.1:8765` (overridable via `--bind` or
  `AZULA_MCP_BIND`)

### Requirement: Stable Bridge Identity
The bridge SHALL derive its connectivity from the session-identity model: a stable machine identity key persisted at `~/.azula/machine.key` (adopting a pre-existing `~/.azula/bridge.key` unchanged, so pairing codes survive the migration) SHALL sign a per-process session certificate, and each bridge process SHALL bind its own session keypair rather than the machine key. `start_pairing` SHALL mint invites for the machine identity so a phone pairs with the machine once, not with an individual session.

The name a session announces to peers SHALL be the operator-supplied label when one is given, and SHALL fall back to a name derived from the session's own endpoint id otherwise. Every command that establishes a session SHALL honour that label; a command that cannot apply it SHALL reject it rather than accept and discard it.

#### Scenario: Labelled one-shot session
- **WHEN** a one-shot command such as `azula message send` is run with a session name supplied
- **THEN** the peer titles the conversation with that label instead of the endpoint-id-derived default

#### Scenario: Unlabelled session keeps a stable default
- **WHEN** no label is supplied
- **THEN** the session announces the endpoint-id-derived default name, unchanged from today

#### Scenario: Restart preserves pairing
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

### Requirement: Device Registry Precedence
Paired devices SHALL be recorded (name, ticket, added-at timestamp) in a
project-local registry and/or a global registry. A registry row SHALL be
identified by the endpoint id its `ticket` resolves to — for either stored
ticket shape, a dialable `EndpointTicket` string or a bare endpoint-id hex
string — and NOT by its display name. Writing a device SHALL replace the row
with the same endpoint id and SHALL NOT replace a row belonging to a
different endpoint id, whatever the two are named. Rows whose ticket does not
resolve to an endpoint id SHALL fall back to name equality, so a
hand-edited registry stays editable.

Display name SHALL remain unique within the merged view, since it is the
handle every device-targeting verb resolves against. When a device is written
whose derived name is already taken by a different endpoint id, the CLI SHALL
disambiguate the new row's name rather than overwrite or reject.

Reads SHALL merge global-then-project, with the project registry taking
precedence when both hold the same endpoint id (or, for unresolvable rows,
the same name). Forgetting a device SHALL remove it from both registry files,
not only from the in-memory device map.

#### Scenario: Two devices paired from invites do not collide
- **WHEN** two phones are paired from separate invites, neither with an
  explicit `--name`
- **THEN** the registry holds two rows, one per endpoint id, and neither
  pairing removes or overwrites the other

#### Scenario: Re-pairing a renamed device updates its own row
- **WHEN** a device the user renamed by hand is paired again from a fresh
  invite, so its ticket text differs but its endpoint id is the same
- **THEN** that row is updated in place rather than duplicated, and no row
  belonging to another endpoint id is touched

#### Scenario: Same endpoint id in both registries
- **WHEN** an endpoint id has a row in both the global and project registry
- **THEN** the merged view uses the project registry's entry for that device

#### Scenario: Unresolvable rows still merge by name
- **WHEN** a registry row's ticket cannot be resolved to an endpoint id
- **THEN** it is matched and merged by name as before, and remains readable
  and forgettable

#### Scenario: Forget removes from both stores
- **WHEN** `disconnect` is called with `forget=true`
- **THEN** the device is deleted from the project registry and the global
  registry, not only from the in-memory map

### Requirement: Runtime State File Reflects the Live Bridge
The bridge SHALL rewrite its runtime state file on every connect, disconnect,
or registry change with the current bind address (or `"stdio"`), process id,
and each known device's connected status, so another process can discover a
running bridge without calling any MCP tool.

#### Scenario: Discovering a running bridge externally
- **WHEN** an external process reads the bridge's runtime state file
- **THEN** it sees the current bind address, pid, and each device's
  connected status without invoking any MCP tool

### Requirement: Pairing Ticket Forms and Peer Naming
Ticket parsing SHALL accept four interchangeable input forms: the `/s/`
web URL, the `/connect/` web URL, the `azula://connect?code=` deep link, or a
bare token. On accepting a connection, the bridge SHALL name the peer using,
in priority order: (1) a endpoint-id match against a known device in the
registry, (2) the `Hello{name}` frame the peer sent, (3) a generated
fallback name. Every accepted app connection (not peer-bridge connection)
SHALL receive a `Hello{name: own_name}` frame in reply.

When `azula pair` registers a device without an explicit `--name`, the
default name SHALL be derived from the endpoint id decoded from the ticket —
its first 8 hex characters — and SHALL NOT be derived from the ticket's
serialized text, whose leading characters are constant for a given ticket
format and therefore identical across devices. A ticket whose endpoint id
cannot be decoded SHALL fail pairing with an error naming the ticket, rather
than fall back to a derivation that may collide.

#### Scenario: Invite-derived pairings get distinct default names
- **WHEN** two devices are paired from `https://azula.app/i/…` invites with
  no `--name`
- **THEN** each is named from its own endpoint id, and neither is named after
  the ticket format's constant prefix

#### Scenario: Undecodable ticket fails loudly
- **WHEN** `azula pair` is given a ticket whose endpoint id cannot be decoded
- **THEN** pairing fails with an error identifying the ticket, and no
  registry row is written

#### Scenario: Reconnecting device with a stale Hello name
- **WHEN** a device with a known registry ticket reconnects but announces a
  different `Hello` name
- **THEN** the bridge names it via the endpoint-id match against the registry,
  not the freshly announced (possibly stale) `Hello` name

#### Scenario: App connection receives a naming reply
- **WHEN** an app (not a peer bridge) connects and is accepted
- **THEN** the bridge sends back `Hello{name: own_name}` so the phone can
  title the conversation

### Requirement: Conversation Naming via set_name
`set_name` SHALL be the only tool that changes a conversation's displayed
name or description. Convention: `name` SHALL be left unset so the
conversation keeps the bridge's own name, with session identity carried in
`description` instead. Omitting the `device` parameter SHALL apply the change
to every currently-connected device.

#### Scenario: Setting a session description for all devices
- **WHEN** `set_name` is called with only `description` set and no `device`
- **THEN** every currently-connected device's conversation is updated with
  that description while its existing name is left unchanged

### Requirement: File Transfer Size Cap and Chunking
`send_file` SHALL reject files over 64 MiB and SHALL transmit accepted files
as a begin frame, followed by one chunk frame per 32 KiB base64-encoded
slice, followed by an end frame, on the device's existing chat stream.
Inbound transfers whose declared size exceeds 64 MiB SHALL be rejected
up front without buffering any chunk data, and an inbound transfer using a
non-base64 encoding SHALL be logged and skipped rather than erroring.

#### Scenario: Outbound oversized file rejected
- **WHEN** `send_file` is called with a path to a file over 64 MiB
- **THEN** the tool rejects the request without sending any transfer frames

#### Scenario: Inbound oversized declared transfer rejected
- **WHEN** an inbound file-begin frame declares a size over 64 MiB
- **THEN** the bridge rejects it up front, surfaces a rejection line in the
  inbox, and never buffers its chunk data

### Requirement: Peer-Bridge say Turn Limit
`say` SHALL enforce the bridge's configured max-turns cap per peer
connection: reaching the cap SHALL close that conversation and notify the
peer with a turn-limit notice, and passing `done: true` SHALL close it
immediately with a caller-closed notice. A closed conversation SHALL reject
further `say` calls until the device reconnects.

#### Scenario: Turn cap reached
- **WHEN** a peer-bridge conversation's turn counter reaches the configured
  max-turns cap
- **THEN** the conversation closes, a turn-limit notice is sent to the peer,
  and further `say` calls are rejected until the device reconnects

#### Scenario: Explicit done closes immediately
- **WHEN** the caller passes `done: true` to `say`
- **THEN** the conversation closes immediately with a caller-closed notice

### Requirement: A2UI Tools Require a Live Connection and Validate Structure
`render_ui`, `update_ui`, and `delete_ui` SHALL speak the A2UI wire protocol
and SHALL require a live device connection, since A2UI surface state cannot
be replayed from the offline mailbox. `render_ui` SHALL validate that
`components` is an array containing exactly one component with `"id":"root"`.

#### Scenario: render_ui without a root component
- **WHEN** `render_ui` is called with a `components` array that has no
  `"id":"root"` entry
- **THEN** the tool call is rejected as invalid

### Requirement: A2UI Image Delivery Constraint
The A2UI `Image` component SHALL only render an embedded data-URI image; a
remote `http(s)://` URL SHALL render a themed placeholder instead of being
fetched. Delivering an actual picture of arbitrary size SHALL instead use
`send_file` as an inline chat attachment, not `render_ui`.

#### Scenario: Remote URL in an Image component
- **WHEN** `render_ui` includes an `Image` component whose `url` is an
  `http://` address
- **THEN** the app renders a themed placeholder, not the remote image

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
