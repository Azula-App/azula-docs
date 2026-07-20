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
The bridge SHALL persist its iroh secret key at `~/.azula/bridge.key` and
reuse it across restarts, so its node id — and therefore its pairing code —
SHALL remain stable.

#### Scenario: Restart preserves pairing code
- **WHEN** the bridge process restarts
- **THEN** it loads the same persisted key and its `start_pairing` URL/QR is
  unchanged

### Requirement: Live-Connection-Only Tools Fail Fast, Never Queue
`send_file`, `render_ui`, `update_ui`, and `delete_ui` SHALL require a live
connection (lazily redialed via a device-reachability check) and SHALL error
immediately if the device is unreachable, rather than queuing to the offline
mailbox.

#### Scenario: render_ui to an offline device
- **WHEN** `render_ui` is called for a device with no live stream and the
  redial attempt fails
- **THEN** the tool call returns an error and no frame is queued

### Requirement: send_message and say Have Mailbox Fallback
`send_message` and `say` SHALL be the only tools with offline
store-and-forward: if the target device is unreachable, the frame SHALL be
appended to that device's mailbox and the tool SHALL report the message as
queued rather than failing.

#### Scenario: send_message to a disconnected device
- **WHEN** `send_message` targets a device that is not currently connected
  and redial fails
- **THEN** the text is appended to the device's mailbox and the tool reports
  it as queued rather than erroring

### Requirement: Offline Mailbox Storage and Flush Ordering
Mailbox frames SHALL be appended as JSONL to a per-device file, capped at
1000 frames with the oldest entries trimmed on overflow. Queued frames SHALL
flush immediately after any successful dial — whether the bridge dials out or
a device dials in — before the send stream is handed to the tool layer. A
flush SHALL clear the mailbox file only once every queued frame has written
successfully. A background loop SHALL periodically retry connecting to any
disconnected device that has mail pending.

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
project-local registry and/or a global registry. Reads SHALL merge
global-then-project, with the project registry taking precedence on a name
collision. Forgetting a device SHALL remove it from both registry files, not
only from the in-memory device map.

#### Scenario: Name collision across registries
- **WHEN** a device name exists in both the global and project registry
- **THEN** the merged view uses the project registry's entry for that name

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
in priority order: (1) a node-id match against a known device in the
registry, (2) the `Hello{name}` frame the peer sent, (3) a generated
fallback name. Every accepted app connection (not peer-bridge connection)
SHALL receive a `Hello{name: own_name}` frame in reply.

#### Scenario: Reconnecting device with a stale Hello name
- **WHEN** a device with a known registry ticket reconnects but announces a
  different `Hello` name
- **THEN** the bridge names it via the node-id match against the registry,
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
