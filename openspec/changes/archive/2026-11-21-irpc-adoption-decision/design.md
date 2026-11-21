## Context

See `proposal.md` (Why). Evaluated 2026-11-21 against irpc 1.0.0 (crate
source, crates.io metadata, docs.rs, the n0 announcement) and azula-cli
`main` at 0.3.1, with the remote-compute branch read but not modified.

**irpc 1.0.0, as published:**

- Released 2026-11-09. `rust-version = "1.91"`, edition 2024. azula's
  toolchain (rustc 1.97) clears it.
- Dependencies are `iroh = "1"` (default features off, so it resolves to
  whatever iroh 1.x azula pins, including 1.5), `noq = "1"`,
  `postcard = "1.1.1"`, tokio and `n0-error`. Default features are `rpc`,
  `iroh`, `stream` and `derive`.
- Declaration: a request enum carries `#[rpc_requests(message = …)]`, and
  each variant names its channels with `#[rpc(tx = oneshot|mpsc…, rx = …)]`.
  The client helpers are `rpc`, `server_streaming`, `client_streaming`,
  `bidi_streaming`, `notify` and `notify_streaming`. Local mode passes typed
  messages over tokio mpsc with no serialization.
- Wire:
  - Each request gets its own QUIC bi-stream.
  - The request and every channel message are postcard bytes behind a varint
    length prefix. An mpsc item also carries a trailing delivered/aborted
    marker, so a cancelled send isn't delivered.
  - Each message is capped at 16 MiB (`MAX_MESSAGE_SIZE`).
  - Failures travel as QUIC reset/stop codes (`ErrorCode`) and surface as
    typed `RpcSendError`/`RpcRecvError` with `remote_code()`.
  - n0 has committed to keeping this wire format.
- Evolution: versioning is explicitly left to the user. The supported path is
  to append request variants at the end of the enum, with
  `Handler::skip_bad_requests(true)` on from the protocol's first release, so
  an old server rejects new requests with `RequestDecodeFailed` and keeps
  serving the connection. irpc-schema adds per-call schema hashes on top.
- Cross-language use is a stated non-goal ("for talking from rust to rust").
  No wire spec is published for other implementations.

**azula's iroh protocols** (full map in the new
`specs/wire-protocols/design.md`):

| ALPN | Speakers | Framing |
|---|---|---|
| `azula/llm/0` | app ↔ CLI (`run`, `terminal`, `mcp`, bridge); session → relay | NDJSON `Frame`, long-lived stream |
| `azula/term/0` | app ↔ CLI; `azula terminal` CLI ↔ CLI | NDJSON `Frame`, one stream per terminal |
| `azula/chat/0` | app ↔ app; app ↔ relay | NDJSON `Frame`, long-lived stream |
| `azula/sync/0` | sibling app devices ↔ each other; app → relay | NDJSON `Frame`, handshake then push |
| `azula/link/0` | root device (app) → new device (app or CLI) | NDJSON `Frame`, one exchange |
| `azula/media/0` | app ↔ app only (no Rust side) | JSON request/response lines, then raw bytes |
| `azula/compute/1` (in flight) | CLI ↔ CLI broker, then spliced to the guest | u32/u32 length-prefixed JSON header + raw payload |

The NDJSON codec is `write_frame`/`read_frame` in `azula-cli/src/proto.rs`
(about 35 lines) and `FrameCodec` + `LineBuffer` in
`azula-app/network-api`. Both sides tolerate unknown input. Rust's `Frame`
has a `#[serde(other)] Unknown` arm and unknown fields fall to serde defaults.
Kotlin uses `ignoreUnknownKeys = true`, and its read loops skip lines that
don't decode.

## Goals / Non-Goals

**Goals:**

- A per-protocol decision (adopt, don't adopt, or later) that weighs:
  - wire compatibility with shipped app and CLI versions,
  - the Kotlin/iroh-kmp cost,
  - how much code irpc would actually delete,
  - error and cancellation semantics.
- A durable rule for when irpc is the right tool for future protocols.

**Non-Goals:**

- Changing any protocol, dependency or code path.
- Fixing the framing gaps the evaluation surfaced. They are listed under
  Risks as follow-ups.

## Decisions

### D1. App-spoken protocols stay on the NDJSON `Frame` codec

Applies to `llm/0`, `term/0`, `chat/0`, `sync/0`, `link/0` and `media/0`.
**Verdict: don't adopt.**

1. **There is no Kotlin side, and building one is the expensive part.**
   - kotlinx.serialization ships JSON, CBOR and ProtoBuf formats, but no
     postcard.
   - A port needs two pieces. The first is a custom `SerialFormat`: LEB128
     varints, zigzag integers, enum variant indices, Option tag bytes and
     length-prefixed sequences. The second is irpc's stream layer over
     iroh-kmp's raw streams: the length prefix, the mpsc delivery marker, and
     the `ErrorCode` reset and stop semantics.
   - Both have to stay bit-identical to the output of a Rust crate's serde
     derives. With no schema file, Rust enum and field declaration order
     becomes the cross-language contract.
   - n0 calls cross-language use a non-goal, so azula would own that contract
     alone.
2. **Postcard can't evolve the way these protocols do.**
   - azula has added optional fields to live frames without breaking shipped
     peers (`Hello.invite`, `Hello.cert`, `Chat.id`), and new frame kinds too
     (`term_attach`/`term_session`, the `sync_*` and `link_*` families,
     `media_offer`).
   - That works because both sides ignore unknown fields and types. Postcard
     isn't self-describing: field order is the schema, so an added field
     breaks decoding in at least one direction.
   - An unknown variant on a stream is `MessageDecodeFailed`, which ends the
     channel.
   - irpc's own evolution story (append-only request variants plus
     `skip_bad_requests`) covers new *requests*. It doesn't cover new fields,
     or new message kinds inside a long-lived stream.
3. **Shipped peers pin the format.**
   - The shipped app (0.0.8, 2026-10-15, on Play internal and TestFlight) and
     CLI 0.3.x speak NDJSON on the `/0` ALPNs.
   - A switch means new `/1` ALPNs, with the CLI, relay and app all serving
     both formats until old installs age out. That is more code during the
     transition, not less, for no user-visible gain.
4. **It would delete very little.**
   - The shared codec is about 35 lines of Rust.
   - The rest of each handler is session logic irpc doesn't touch: hello and
     invite gates, certificate checks, `accept_gate`, folding into the log and
     conversation stores, PTY sessions with reattach and scrollback replay,
     redial and relay fallback.
5. **The shapes don't line up.**
   - irpc's unit is one request on its own stream.
   - `chat`, `llm` and `sync` are long-lived sessions that push in both
     directions. `term` multiplexes reattachable terminals over one
     connection.
   - `bidi_streaming` could carry each of them, but only by wrapping today's
     session loop in a new envelope.
6. **Errors and cancellation favor irpc, but not by enough.**
   - irpc's typed errors, reset codes and cancel-safe sends are better than
     the NDJSON path, where a failure is either EOF or a decode `Err`.
   - But azula handles failure at the connection level: redial, relay
     fallback, and retry with `id` dedup. irpc wouldn't replace any of that.

### D2. `azula/compute/1` keeps its own frames

**Verdict: don't adopt now; revisit only on the trigger below.**

The protocol (azula-cli `vm/README.md` §1–2 and `vm/BROKER.md` §5 on the
`remote-compute` branch):

- Each request gets its own connection and one bi-stream.
- The client authenticates with `hello`/`welcome` (grant id plus secret), then
  sends exactly one request: `ping`, `vm`, `guest_ping` or `exec`.
- One frame format serves all three hops:
  - client ↔ broker over iroh,
  - broker ↔ the Swift `azula-vm` helper over a Unix socket,
  - helper ↔ `azula-guest` over vsock. `azula-guest` is a static musl binary
    with no tokio or iroh.
- For `exec`, the broker forwards one rewritten request frame and then splices
  bytes both ways without parsing job output.

Using irpc on the client ↔ broker leg would mean:

- The broker would decode every guest frame and re-encode it as an irpc mpsc
  item, and do the reverse for `stdin`/`stdin_eof`/`cancel`. That gives up
  the unparsed splice and its "never parses job output" property.
- `frame.rs` would stay anyway: the broker still needs it toward the
  helper/guest, and `compute/guest.rs`'s worker ping uses it too. The result is a second
  codec with nothing deleted.
- The control requests (`ping`, `vm …`, `guest_ping`) fit irpc best. But they
  share the grant handshake with `exec`, so moving only them would duplicate
  grant auth on a second ALPN.
- The feature is about to merge and ship as azula-cli 0.4.0, and this would
  change its wire before the first release.

**Revisit trigger:** if the broker grows a control plane that sends several
requests per connection (remote grant administration, VM lifecycle sessions),
give it its own irpc ALPN with grant auth as the first request. `exec` stays
on frames.

### D3. No in-process use

irpc's local mode suits actor-style services that pass typed request enums
with reply channels. azula-cli has no such actors. Its only non-test
mpsc/broadcast channels (5, in `term.rs` and `cli/terminal_cmd.rs`) are plain
queues, so nothing would convert.

### D4. New protocols spoken only by Rust binaries: consider irpc first

When every speaker is azula Rust code, no non-Rust hop parses the bytes, and
the shape is request-per-stream (rpc or streaming per request), irpc 1.x is
the default candidate over another hand-rolled codec. If adopted:

- **Its own ALPN.** Never share an ALPN with an NDJSON protocol.
- **`Handler::skip_bad_requests(true)` from the first release.** It is the
  only way to add request variants later.
- **Append request variants only, and never change a shipped message's
  fields.** Add a new request variant instead.
- **Authenticate per connection before serving requests.** Either gate in
  `ProtocolHandler::accept` the way `accept_gate` does today, or authenticate
  with a first request through a manual `read_request` loop, as irpc's
  `examples/auth.rs` does.
- **Use the `iroh` feature with azula's iroh pin.** irpc's `iroh = "1"` with
  default features off follows it.

### Alternatives considered

- **Port postcard and irpc's stream layer to Kotlin, then migrate:** rejected
  per D1.1–D1.3.
- **Run irpc on new `/1` ALPNs next to NDJSON `/0`:** rejected. It means
  carrying two formats with no user-visible gain.
- **Use irpc only on the CLI ↔ CLI legs of app protocols.** These legs are
  the session → relay link on `llm/0` and `azula terminal` → host on
  `term/0`. Rejected: both carry the app protocol's own frames. The relay
  folds the session's `chat`/`a2ui` frames and replays them to the app, and
  `azula terminal` reuses the app's `term` frames. A parallel postcard model
  of the same messages would have to track the NDJSON one forever.

## Risks / Trade-offs

- [The NDJSON readers cap no line length. Rust `read_frame` calls
  `read_line` into an unbounded `String`, and Kotlin `LineBuffer` has no
  limit either. A peer can make either side buffer an arbitrarily long line,
  including on the first, not-yet-authenticated `hello`.] → Follow-up, not
  part of this change: cap the line length in both codecs, the way irpc's
  16 MiB `MAX_MESSAGE_SIZE` does. This is the one hardening win the
  evaluation turned up.
- [NDJSON errors are coarse: a failure is EOF or a decode error, with no
  per-request codes.] → Accepted. Failures are handled at the connection
  level (redial, relay fallback, `id` dedup). Revisit if a protocol starts
  needing structured remote errors.
- [Future Rust-only protocols might pick irpc and fragment the codebase across
  two framing styles.] → D4 limits irpc to protocols that are Rust-only end
  to end, with their own ALPN, and the protocol map records which ALPN uses
  which.
- [irpc's wire commitment covers Rust peers only.] → Only relevant under D4,
  where every peer is Rust.
