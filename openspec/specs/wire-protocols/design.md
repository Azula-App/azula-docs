# Wire protocols: design

Companion to [`spec.md`](spec.md). It maps every iroh ALPN azula defines and
records when a Rust-only RPC framework (irpc) is the right tool. Each
protocol's message shapes live in the capability that owns it. This page
only points there.

## Protocol map

| ALPN | Speakers | Framing | Specified in |
|---|---|---|---|
| `azula/llm/0` | app ↔ CLI (`run`, `terminal`, `mcp`, the bridge); CLI session → relay | NDJSON `Frame`, one long-lived bi-stream, prompt `chat` → `thinking`/`token` stream, A2UI, inline `file_*` | [`mcp-bridge`](../mcp-bridge/design.md), [`relay`](../relay/design.md) |
| `azula/term/0` | app ↔ CLI host; `azula terminal` CLI ↔ CLI host | NDJSON `Frame`, one bi-stream per terminal, reattach by session id | [`terminal`](../terminal/design.md) |
| `azula/chat/0` | app ↔ app; app ↔ relay | NDJSON `Frame`, long-lived bi-stream, `hello` first | [`relay`](../relay/design.md), [`invitations`](../invitations/design.md) (`hello.invite`), [`media-transfer`](../media-transfer/design.md) (`media_offer`) |
| `azula/sync/0` | sibling app devices ↔ each other; app → relay (the CLI only accepts) | NDJSON `Frame`, mutual `sync_hello`, then vectors, entries, and live push | [`account-sync`](../account-sync/spec.md) |
| `azula/link/0` | root device (app) → new device (app or CLI) | NDJSON `Frame`, one `link_hello` → `link_grant`/`link_reject` exchange, with a priming `\n` from the dialer | [`device-linking`](../device-linking/spec.md) |
| `azula/media/0` | app ↔ app only; azula-cli has no handler | one JSON request line, one JSON response line, then the raw body | [`media-transfer`](../media-transfer/design.md) |
| `azula/compute/1` | CLI client ↔ CLI broker; the broker splices to the guest | u32 header length + u32 payload length + JSON header + raw payload, shared with the helper and guest hops | `azula-cli/vm/README.md` §1–2, `vm/BROKER.md` §5; capability [`remote-compute`](../remote-compute/) (shipped in azula-cli 0.4.1) |

The **NDJSON `Frame` codec** is shared by the five `Frame` ALPNs:

- **Rust:** `azula-cli/src/proto.rs` (`Frame`, `write_frame`, `read_frame`).
- **Kotlin:** `azula-app/network-api/src/dev/azula/net/Protocol.kt`
  (`Frame`, `FrameCodec`) and `LineBuffer.kt`.
- **Format:** one JSON object per `\n`-terminated line, internally tagged by
  `"type"`. Blank lines are keepalives.
- **Forward compatibility** (the spec's additive-evolution requirement):
  - Rust `Frame` has a `#[serde(other)] Unknown` arm, and new fields are
    `Option` with `#[serde(default)]`.
  - Kotlin decodes with `ignoreUnknownKeys = true` and its read loops skip
    lines that don't decode.
- **Size cap:** a line may be at most 16 MiB. See below.

## Frame size cap

Every NDJSON `Frame` line is capped at **16 MiB** (16,777,216 bytes, not
counting its `\n`). That's the same per-message cap irpc uses. The cap
applies from a stream's first byte, so it covers the not-yet-authenticated
first frame (`hello`, `sync_hello`, `link_hello`) on all five `Frame` ALPNs.

- **Rust:** `proto::MAX_FRAME_LINE_BYTES`. `read_frame` reads at most one
  byte past the cap, then fails with `proto::FrameTooLong`. Every caller
  already ends the stream on a `read_frame` error.
- **Kotlin:** `MAX_FRAME_LINE_BYTES` in `network-api`'s `LineBuffer.kt`.
  `LineBuffer` buffers at most the cap plus one chunk, then throws
  `FrameLineTooLongException` and rethrows it on every later read. The iroh
  `P2pStream` wrappers (`network-real`) catch it, `stop` the receive side,
  and return end-of-stream, so each caller runs its ordinary peer-closed
  teardown. An exception there would be uncaught on desktop and iOS. In the
  app, `azula/media/0`'s request and response lines go through the same
  `LineBuffer` and get the same cap.

An oversize line is a protocol error, not an unknown frame. The reader ends
the stream and never resumes at the next line. Skipping would mean reading
an arbitrarily long line just to find where it ends.

### Sizing

The cap has to cover the largest legitimate frame:

| Frame | What bounds it | Largest line |
|---|---|---|
| `term` | 64 KiB replay chunks (`term.rs` `REPLAY_CHUNK`); live output is read 4 KiB at a time | 384 KiB, if every byte is escaped as `\u00XX` |
| `profile` | avatar scaled to at most 256 px a side | a few hundred KiB |
| `a2ui_snapshot` | 256 KiB per surface (`relay_a2ui::MAX_SNAPSHOT_BYTES`) | ~256 KiB |
| `file_chunk` | 32 KiB of raw bytes per chunk (`filexfer::CHUNK_SIZE`) | ~44 KiB |
| `media_offer` | thumbnail at most 32 KiB of base64 | ~33 KiB |
| `sync_entries` | at most 64 entries **and** at most 4 MiB of base64 per frame | ~4 MiB, unless one entry alone is bigger |
| `sync_a2ui` | at most 4 MiB of messages per frame; a conversation can span several frames | ~4 MiB, unless one message alone is bigger |
| `chat`, `token`, `a2ui`, `link_grant` | nothing in code: text and UI written by a person or an LLM, and contact and certificate lists | KiB to low MiB in practice |

`sync_entries` and `sync_a2ui` pack a variable number of items into one
frame, so a count limit alone can't bound them. Their senders also close a
batch at `BATCH_BYTES_PER_FRAME`, a quarter of the cap (4 MiB):

- **Rust:** `proto::size_batches`, used by `sync::send_gap` and the relay's
  `mailbox_role::sync_a2ui_frames`.
- **Kotlin:** `SyncSession.sendGap`. The app never sends `sync_a2ui`.

Receivers apply each frame on its own and in order, so the split needed no
receiver change. Older peers accept it too.

Raw byte bodies aren't lines and aren't under this cap: the body after a
binary `file_begin` (at most 64 MiB, checked before it's read) and an
`azula/media/0` body (at most 512 MiB, streamed in chunks).

### What the cap doesn't cover

A single item bigger than the cap still fails. Nothing bounds a message's
text when it is written or appended to the log. A `chat` frame over 16 MiB
would close the receiving stream. A log entry whose base64 alone passes
16 MiB (a message of about 12 MiB) would be refused by every sibling, and
sync for that device would stop at that entry. Nothing sends messages that
large today. Capping message text where it's composed or appended would
close this.

## Why not irpc for these

n0's [irpc](https://github.com/n0-computer/irpc) 1.0 (2026-11-09):

- Each request gets its own QUIC bi-stream. Messages are postcard-encoded
  behind a varint length prefix, with typed oneshot/mpsc channels.
- Failures travel as QUIC reset codes, and each message is capped at 16 MiB.
- It requires `iroh = "1"` and MSRV 1.91.
- n0 has committed to the wire format, but only between Rust peers.
  Cross-language use is a stated non-goal.

Evaluated 2026-11-21. No azula ALPN adopts it. The full reasoning is in
[`changes/archive/2026-11-21-irpc-adoption-decision/design.md`](../../changes/archive/2026-11-21-irpc-adoption-decision/design.md).
In short:

- **App-spoken ALPNs** (`llm`, `term`, `chat`, `sync`, `link`, `media`):
  - Postcard has no Kotlin codec, and irpc publishes no spec to write one
    against.
  - Postcard isn't self-describing, so the optional fields and new frame
    kinds these protocols have added on `/0` would each have broken shipped
    peers.
  - Switching needs new ALPN versions served in parallel with the old ones.
  - The codec it would replace is about 35 lines. The rest is session logic
    irpc doesn't touch.
- **`azula/compute/1`:** its frames run end to end to a static, tokio-less
  guest worker and a Swift helper. The broker splices `exec` streams without
  parsing them. irpc on the client ↔ broker leg would add a re-framing codec
  next to the one that has to stay.

## When to reach for irpc

Consider irpc 1.x first, instead of another hand-rolled codec, when a **new**
protocol meets all of these:

- every speaker is azula Rust code (the app never speaks it),
- no non-Rust hop parses its bytes,
- its unit of work is a request, a stream of requests, or a stream per
  request.

If it's adopted:

- **Give it its own ALPN.**
- **Turn on `Handler::skip_bad_requests(true)` from the first release.** It is
  the only way to add request variants later.
- **Append request variants only, and never change a shipped message's
  fields.** Add a new variant instead.
- **Authenticate the connection before serving requests.** Either gate in
  `ProtocolHandler::accept`, as `accept_gate` does today, or authenticate
  with a first request through a manual `read_request` loop (irpc's
  `examples/auth.rs`).
- **Add the protocol to the map above.**

The first likely candidate is a multi-request control plane for the compute
broker (grant administration, VM lifecycle). Compute's `exec` stays on its own
frames.
