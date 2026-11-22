# wire-protocols Specification

## Purpose
Cross-protocol rules every azula iroh ALPN follows: which wire formats an
app-spoken protocol may use, and how a protocol's messages may change without
a new ALPN version. Each protocol's own message shapes stay specified in the
capability that owns it; the design page maps every ALPN to that owner.

## Requirements

### Requirement: App-Spoken Protocols Use A Language-Neutral Wire Format
Every iroh protocol the azula app speaks SHALL use a wire format that is written down in the owning capability's spec or design page and implemented independently in Rust and Kotlin, and SHALL NOT use an encoding defined only by a Rust library. Today this covers `azula/chat/0`, `azula/llm/0`, `azula/term/0`, `azula/sync/0` and `azula/link/0`, which use the shared newline-delimited JSON `Frame` codec (one object per line, internally tagged by `"type"`), and `azula/media/0`, which uses one JSON request line and one JSON response line followed by raw body bytes. A protocol spoken only between azula Rust binaries is not bound by this requirement.

#### Scenario: Adding a message kind to an app-spoken protocol
- **WHEN** a change adds a message kind to `azula/chat/0`, `azula/llm/0`, `azula/term/0`, `azula/sync/0` or `azula/link/0`
- **THEN** the kind is added under the same `"type"` tag to both the Rust and the Kotlin frame definitions
- **AND** the capability that owns the ALPN documents its JSON shape

#### Scenario: A Rust-only encoding is proposed for an app-spoken protocol
- **WHEN** a change proposes carrying an app-spoken protocol in an encoding that has no Kotlin implementation
- **THEN** the proposal is out of bounds until it also delivers that Kotlin implementation and a new ALPN version served alongside the old one for shipped peers

### Requirement: Changes Within An ALPN Version Are Additive
A change to an app-spoken protocol's messages SHALL keep peers on the same ALPN version interoperable: a new field SHALL be optional with a default, and a receiver SHALL skip a frame whose type it does not recognize and ignore fields it does not recognize instead of failing the stream. A change that cannot meet this SHALL use a new ALPN version.

#### Scenario: New optional field
- **WHEN** a newer peer sends a frame with a field an older peer does not know
- **THEN** the older peer decodes the frame, ignores the field, and keeps the stream open

#### Scenario: Unknown frame type
- **WHEN** a newer peer sends a frame whose `"type"` the receiver does not recognize
- **THEN** the receiver skips that frame and keeps reading the stream

#### Scenario: Incompatible change
- **WHEN** a change would make a frame undecodable by peers that shipped on the current ALPN version
- **THEN** it ships under a new ALPN version, and peers keep serving the old version until shipped clients no longer need it

### Requirement: Frame Lines Are Bounded
A receiver on an NDJSON `Frame` ALPN SHALL accept a frame line of up to 16 MiB (16,777,216 bytes, not counting the terminating `\n`). It SHALL treat a longer line as a protocol error that ends the stream: it SHALL NOT buffer more than the cap plus one read's worth of the line, and SHALL NOT skip the line and keep reading. The cap SHALL apply from the stream's first byte, including the not-yet-authenticated first frame. A sender SHALL keep every frame line it emits within the cap. A sender that packs a variable number of items into one frame SHALL split them across several frames, in order, instead of exceeding it.

#### Scenario: Line at the cap
- **WHEN** a peer sends a frame line of exactly 16 MiB
- **THEN** the receiver decodes it and keeps reading the stream

#### Scenario: Line over the cap
- **WHEN** a peer sends a line longer than 16 MiB, including as its first frame before any authentication
- **THEN** the receiver ends the stream once it has buffered no more than the cap plus one read
- **AND** it decodes neither that line nor any line after it

#### Scenario: Batched items exceed one frame's budget
- **WHEN** a sender has more `sync_entries` entries or `sync_a2ui` messages than fit in one frame's byte budget
- **THEN** it sends them across several frames, in order, each within the cap
