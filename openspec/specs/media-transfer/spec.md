# Media Transfer Specification

## Purpose
Defines the offer/pull model for peer-to-peer image, audio, video, and
file attachments: metadata offered on the chat stream, bytes pulled on
demand over a dedicated ALPN with resumable disk-backed streaming, and the
storage, export, and threat-model constraints that govern it.

## Requirements

### Requirement: PEER-Only Streamed Media
Streamed media offer/pull SHALL apply only to `ConversationKind.PEER`
conversations. Other conversation kinds SHALL continue to use the legacy
inline `file_begin` path, which SHALL also remain available as a
wire-compatible fallback for peers that do not support media offers.

#### Scenario: Sending media in a non-PEER conversation
- **WHEN** a user attaches media in a conversation that is not
  `ConversationKind.PEER`
- **THEN** the legacy inline `file_begin` path SHALL be used instead of a
  media offer

### Requirement: Offer Carries Fetch-Back Ticket
A media offer SHALL be sent on the chat ALPN and SHALL carry an id, kind,
name, mime, size, and optional caption/width/height/durationMs/thumbnail,
plus a `fetchTicket` that SHALL be the sender's own freshly generated
connect-back ticket — so that a receiver who only accepted an inbound
chat connection from the sender, and holds no outbound ticket of its own,
can still dial back to fetch the bytes.

#### Scenario: Receiver has no outbound ticket for the sender
- **WHEN** the receiver only ever accepted an inbound chat connection from
  the sender
- **THEN** the receiver SHALL be able to fetch the media using the
  `fetchTicket` included in the offer

### Requirement: Dedicated Fetch ALPN and Mini-Protocol
Media bytes SHALL be transferred over an ALPN dedicated to media fetch,
distinct from the chat ALPN, using one connection per fetch. The fetch
protocol SHALL proceed as: the receiver sends `{id, offset}`; the sender
replies with an ok message carrying `id`, `size`, and `offset`, or an
error message; on ok, the sender SHALL stream the raw binary body in
bounded-size chunks — never as a single unbounded read of the whole body
— and SHALL close the stream at the end; the receiver SHALL stop reading
once it has received `size` bytes.

#### Scenario: Resuming a partially downloaded file
- **WHEN** a receiver already has N bytes of a blob on disk and
  re-initiates a fetch for it
- **THEN** the receiver SHALL request `offset = N`
- **AND** the sender SHALL begin streaming from byte N, not from the start

#### Scenario: Fetch request for an unknown media id
- **WHEN** a fetch request references a media id the sender does not have
- **THEN** the sender SHALL reply with an error message and SHALL NOT
  stream a body

### Requirement: Inbound Media Routed Before Conversation Handling
Inbound connections on the media ALPN SHALL be routed to the media-serving
handler before any conversation or chat handling runs. The media ALPN
SHALL be present only in the set of ALPNs a peer binds to accept
connections on, never in the set raced when dialing out.

#### Scenario: Peer receives a media fetch connection
- **WHEN** an inbound connection arrives on the media ALPN
- **THEN** it SHALL be handled by the media-serving path directly, without
  passing through general conversation/message handling

### Requirement: Streaming Storage to Disk
Media blobs SHALL be written to and read from a durable, disk-backed (or
platform-equivalent) store supporting existence check, size-on-disk
query, append-from-current-offset writing, offset-based reading, and
deletion, so that transfers can resume purely from what already exists on
disk.

#### Scenario: App killed mid-download
- **WHEN** the app process is killed while a blob is partially downloaded
- **THEN** on restart, the transfer state SHALL be reconciled from the
  blob's actual on-disk size compared to its declared total size,
  resulting in Complete, a resumable paused-download state, or Offered —
  never a stuck or corrupted state

### Requirement: Message Payload Stays Small
Persisted message and attachment records SHALL reference blob-backed
media by id plus metadata, never by embedding full body bytes, while
still correctly decoding older records that embedded inline base64 body
bytes directly.

#### Scenario: Reading a pre-existing inline-media message
- **WHEN** a persisted message predates blob-backed attachments and
  carries inline base64 bytes
- **THEN** it SHALL still decode and render correctly

### Requirement: Auto-Export of Received Media
Every received media blob SHALL be automatically exported to
user-visible platform storage exactly once, at the moment it reaches the
Complete transfer state, without prompting the user beyond any one-time
OS-level permission grant. Sent media SHALL never be auto-exported.
Export SHALL be best-effort: a missing export capability, a missing
on-disk path, or an export failure SHALL be silently ignored and SHALL
NOT block or fail the underlying transfer.

#### Scenario: Receiving an image
- **WHEN** a received image attachment reaches the Complete state
- **THEN** it SHALL be exported to the platform's visible media storage
  exactly once

#### Scenario: Export fails
- **WHEN** the platform export call fails, or no exporter is configured
  for the current build
- **THEN** the transfer SHALL still be reported as Complete to the user,
  unaffected by the export failure

### Requirement: Offer Auto-Fetch and Size Gates
An incoming offer SHALL be auto-fetched when its kind is image, or when
its declared size is at or below the auto-download threshold. An offer
whose declared size exceeds the maximum allowed size SHALL be presented
as a Failed ("too large") placeholder and SHALL NOT be auto-fetched or
otherwise fetched.

#### Scenario: Oversize offer received
- **WHEN** an incoming media offer declares a size larger than the
  maximum allowed size
- **THEN** it SHALL appear as a Failed placeholder and SHALL NOT be
  fetched

### Requirement: Fetch Lifecycle Is Resumable and Race-Safe
A fetch in progress SHALL be resumable and cancellable. Starting a new
fetch for a blob that has a cancelled or still-in-flight predecessor
SHALL NOT corrupt shared transfer state: a successor fetch SHALL join the
predecessor's cleanup, and only the fetch that owns a given in-flight
slot SHALL deregister it.

#### Scenario: Rapid cancel-then-retry
- **WHEN** a user cancels a fetch and immediately retries it
- **THEN** the retry SHALL result in a single consistent transfer state,
  not a stuck or duplicated in-flight entry

### Requirement: No ACL or Expiry on Served Blobs
A served blob SHALL remain fetchable by any peer holding its offer id for
as long as the blob exists on the sender, with no access-control list,
expiry, or revoke-on-delete. Blob ids SHALL be unguessable and SHALL
travel only over the encrypted chat stream to the intended peer.

#### Scenario: Peer re-fetches previously downloaded media
- **WHEN** a peer that already downloaded a media item re-initiates a
  fetch for the same id while the blob still exists on the sender
- **THEN** the sender SHALL serve it again with no additional
  authorization check beyond possession of the id

### Requirement: Stale Fetch Ticket Fails Closed
A fetch using an offer's `fetchTicket` SHALL fail, rather than silently
succeed against a different identity, if the sender's identity has
rebound since the offer was sent (e.g. a recovery-phrase import).
Recovery SHALL be by the sender re-sending (re-offering) the media, not
by silently repairing the stale ticket.

#### Scenario: Sender re-imported their identity after offering media
- **WHEN** a receiver attempts to fetch media using a `fetchTicket` from
  before the sender's identity rebind
- **THEN** the fetch SHALL fail
- **AND** recovery SHALL require the sender to re-offer the media
