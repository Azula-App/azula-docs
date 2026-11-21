## Why

n0 released irpc 1.0 on 2026-11-09. It is a typed RPC layer over iroh/noq QUIC
streams: postcard encoding, one bi-stream per request, oneshot/mpsc channel
shapes, and a wire format n0 has committed to. iroh-blobs and iroh-gossip run
on it. azula hand-rolls the framing for each of its iroh protocols, so Sal
asked whether irpc would improve azula, and to adopt it where it does.

The evaluation found that no azula protocol should adopt it now. This change
records that decision and the two wire properties behind it, so the question
isn't reopened one protocol at a time.

## What Changes

- **Decision: no protocol adopts irpc now.** Six of the seven ALPNs are spoken
  by the Kotlin app (`azula/chat/0`, `llm/0`, `term/0`, `sync/0`, `link/0`) or
  only by it (`media/0`). irpc is Rust-to-Rust by design and postcard has no
  Kotlin codec. The seventh, `azula/compute/1` (in flight on azula-cli's
  `remote-compute` branch), is CLI↔CLI. But its broker splices bytes unparsed
  to a guest worker and a Swift helper that share its frame format, so irpc
  would add a second codec without removing the first. The full per-protocol
  reasoning is in `design.md`.
- **New `wire-protocols` capability** states the two properties that rule irpc
  out for the app-spoken protocols. First, their wire format is
  language-neutral and implemented in both Rust and Kotlin. Second, changes
  within an ALPN version are additive: old peers ignore unknown frame types
  and fields.
- **`specs/wire-protocols/design.md`**: a map of every ALPN (speakers,
  framing, owning capability), and the conditions under which irpc becomes
  the right tool. The main one is a new protocol spoken only between azula
  Rust binaries.
- No code changes in any repo, and no new dependency.

## Capabilities

### New Capabilities

- `wire-protocols`: the cross-protocol rules every azula iroh ALPN follows:
  language-neutral framing for app-spoken protocols, and additive evolution
  within an ALPN version. Its design page maps every ALPN.

### Modified Capabilities

None. Each protocol's own framing stays specified in its capability
(`account-sync`, `device-linking`, `terminal`, `relay`, `media-transfer`,
`mcp-bridge`).

## Impact

- Docs only (`azula-docs`). azula-cli, azula-app and iroh-kmp are unchanged.
- The in-flight `remote-compute-vm` change is unaffected. `azula/compute/1`
  keeps the frame format in `azula-cli/vm/README.md` §1.
- Future protocol work gets a stated default: stay on the shared NDJSON
  `Frame` codec if the app speaks the protocol, and consider irpc 1.x if only
  Rust binaries do.
