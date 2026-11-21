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
| `azula/compute/1` | CLI client ↔ CLI broker; the broker splices to the guest | u32 header length + u32 payload length + JSON header + raw payload, shared with the helper and guest hops | `azula-cli/vm/README.md` §1–2, `vm/BROKER.md` §5 (change `remote-compute-vm`) |

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

Known gap: neither reader caps the line length. `read_frame` calls
`read_line` into an unbounded `String`, and `LineBuffer` has no limit either.

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
