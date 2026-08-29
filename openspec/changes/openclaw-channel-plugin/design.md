# Driving OpenClaw through azula

## Context

See [proposal.md](proposal.md) for motivation. The constraints that actually
shape the design:

- **OpenClaw loads Node/TypeScript plugins.** A channel plugin is an npm
  package exporting `defineChannelPluginEntry`, with `openclaw.channel`
  metadata in `package.json` and a config schema in `openclaw.plugin.json`.
  Nothing about that runtime can be satisfied by a Kotlin module in
  `azula-app`, which is why this change adds a repo rather than an app module.
- **azula sessions are per-process identities.** Since `cli-multi-session-relay`
  every azula process binds its own certified session keypair
  (`session::SessionKey::resolve`), and its endpoint id is what the phone titles
  a conversation by. Two processes cannot share one named session key
  concurrently — that collision is exactly what the multi-session work removed.
  So "one conversation on the phone" means literally one azula process.
- **The bridge's inbox is one queue with destructive reads.** `get_messages`
  drains it as rendered lines; `wait_for_reply` long-polls *and drains* it as
  rendered lines (`bridge/tools.rs:319`, `WaitOutcome::Lines`). There is no
  existing way to observe the inbox structurally, and no way to read it without
  consuming it.
- **`thinking` is not independently addressable.** The app's thinking state is
  emitted only inside `send_message`'s stream
  (`thinking(true) → token → token_done → thinking(false)`). No tool sets it
  alone.
- **The A2UI `Image` constraint stands.** Remote `http(s)` URLs render a themed
  placeholder; real pictures go through `send_file`. Interactive surfaces are
  for controls, not for delivering media.

## Goals / Non-Goals

**Goals:**

- One azula conversation per configured account, stable across gateway
  restarts.
- Inbound fidelity: a tap, a file, and a message stay distinguishable all the
  way to the agent.
- Additive changes to `azula-cli` only — no wire-protocol change, no behavior
  change for existing MCP clients.
- The plugin degrades to a legible configuration error, never a crash loop,
  when azula is missing or unpaired.

**Non-Goals:**

- Reimplementing iroh, the session-certificate model, or the chat wire format
  in TypeScript.
- Being a general MCP client. The plugin speaks to exactly one server whose
  tool surface is specified in `mcp-bridge`.
- Multi-user or group semantics. One account addresses one device; there is no
  fan-out and no per-sender routing beyond that.

## Decisions

### D1: Spawn one `azula mcp` stdio child, owned by the plugin

The plugin runs `azula mcp --session openclaw --name <label>` as a child
process and speaks MCP JSON-RPC over its stdin/stdout, for the channel's whole
lifetime.

*Alternatives considered.* **Reimplement the iroh transport in TypeScript** —
would duplicate the endpoint, certificate chain, registry, relay fallback and
file chunking, and would have to track every change to them; rejected outright.
**Shell out per operation** (`azula message send`, `azula ui render`) — each
invocation is a fresh one-shot session with its own key, so the phone would see
a new conversation per message; rejected. **Point at a long-running
`azula mcp --http`** — plausible, but it makes the operator responsible for
starting, supervising and port-managing a daemon the plugin depends on, and
leaves ownership of restarts ambiguous. stdio keeps lifetime, supervision and
crash recovery inside the thing that cares.

`--session openclaw` (a *named* persistent session, not the default ephemeral
one) is what makes the conversation survive restarts: the key at
`~/.azula/sessions/openclaw.key` persists, so the endpoint id — and the
conversation the phone titles by it — is stable.

### D2: One session for both directions, which forces `get_events`

Given D1 and the per-process identity constraint, inbound cannot come from a
second process: `azula watch --json` already emits exactly the structured event
stream this plugin wants, but running it alongside `azula mcp` means a second
session, a second endpoint id, and a second conversation on the phone. Sharing
one named key across both processes is not an option.

So inbound has to come through the same MCP session — and the existing text
drains are insufficient. `get_messages` renders everything to one line per
event: a tap becomes `ui-event: {…}`, an attachment becomes
`[received file: …]`, and a user who types either of those strings is
indistinguishable from the real thing. Media facts and tap payloads are needed
verbatim by OpenClaw's inbound envelope.

`get_events` therefore mirrors `azula watch --json`'s vocabulary rather than
inventing a third one, so the CLI and MCP surfaces stay teachable as one model.

**Why it also long-polls.** The obvious composition — `wait_for_reply` as a
wake signal, then `get_events` to read structurally — does not work, because
`wait_for_reply` drains the inbox itself; by the time it returns, the events are
gone and only their rendered text survives. Rather than add a peek/ack protocol
to a queue that has never needed one, `get_events` takes an optional timeout
and covers both modes itself. The alternative, polling `get_events` on a fixed
interval, trades either latency or a hot loop for nothing.

### D3: `set_typing` as a bare tool, live-only

*Alternatives considered.* **Send a zero-width or placeholder message** —
pollutes conversation history with artifacts the user can see and scroll past.
**Reuse `set_name`'s description** — semantically wrong (it is sticky session
metadata, not turn state) and it would fight with the description the operator
set. **Render an A2UI spinner surface** — heavy for a boolean, needs its own
cleanup path, and races with the real surfaces from D4 for screen space.

A bare `set_typing(device, on)` is the smallest thing that works, and it needs
no wire-protocol change: the `thinking` frame already exists and the app already
renders it.

It is **live-only** — erroring rather than queuing — because a typing indicator
replayed from a relay hours later is actively misleading. This puts it in the
same class as `send_file` under the existing "Live-Connection-Only Tools Fail
Fast, Never Queue" requirement, and the plugin treats a typing failure as
non-fatal: the turn proceeds without the indicator.

### D4: Structured choices become A2UI surfaces, with a text fallback in the
same turn

When an outbound message carries discrete options, the plugin renders a surface
via `render_ui` *and* sends the equivalent text. The text is not redundant: it
is what the conversation reads like in history after the surface is removed,
what a relay-replayed snapshot degrades to, and what the user sees if the
surface cannot be shown.

Correlation runs on the surface id: the plugin derives it from the id of the
message that asked, so an inbound `ui_event` maps back to the question without
keeping a side table that could drift from the conversation. Surfaces are
deleted once answered or once the turn ends, so controls do not accumulate.

`update_ui`'s offline path only works when the same session still holds the
surface's full state, so the plugin re-renders rather than patches after any
session restart.

### D5: azula pairing *is* the access control

OpenClaw's DM security model expects a channel to declare a policy and an
allowlist keyed on channel identifiers. Rather than invent a second identifier
space, the plugin resolves its allowlist from azula's device registry: a device
paired with this machine and named by the account config is allowed, everything
else is not. Pairing is surfaced by presenting `start_pairing`'s invite URL and
QR through OpenClaw's pairing text hooks.

This means there is exactly one pairing act to reason about, and revoking
access is `azula devices` forget — not a second list that can disagree with the
first.

### D6: At-most-once inbound via OpenClaw's durable ingress

The drain is destructive, so a crash between "drained from azula" and
"dispatched to the agent" loses events. OpenClaw provides for exactly this:
`createChannelIngressMonitor` enqueues raw transport envelopes at a single
chokepoint, gates the transport ack on a durable append, and marks completion
after dispatch adoption.

The plugin appends durably *before* treating a drained batch as consumed, and
uses `createIngressEffectOnce` for the non-idempotent side effects (surface
deletion, config writes). Transport classification is "awaited polling" with
standard tombstone retention.

### D7: The plugin declares a minimum azula version and checks it at startup

`get_events` and `set_typing` will not exist in released azula binaries until
this change ships. The plugin probes the bridge's advertised tool list once at
startup and, if either tool is absent, fails with a configuration error naming
the required version and the upgrade command — rather than discovering it
per-message as a tool-not-found error mid-turn.

### D8: New repo, published as `@azula-app/openclaw`

The scope matches the existing `@azula-app/cli`. A separate repo (not a
subpackage of `azula-cli`) keeps a Node package out of a cargo workspace and
lets the plugin release on OpenClaw's cadence rather than the CLI's — the two
version for different reasons, and the plugin will need patch releases against
plugin-SDK changes that have nothing to do with azula.

## Risks / Trade-offs

- **OpenClaw's plugin SDK is young and its surface moves.** → Keep the adapter
  thin and concentrated: all SDK contact in the channel definition and ingress
  wiring, no SDK types leaking into the azula-facing client. Pin the SDK and
  treat plugin-SDK upgrades as their own task.
- **The plugin depends on two tools that do not exist yet.** → D7's startup
  probe turns this from a confusing runtime failure into a clear one; the
  `azula-cli` work is sequenced first in tasks.
- **Named session key means concurrent gateways collide.** Two OpenClaw
  gateways configured with the same session name on one machine would fight
  over `~/.azula/sessions/openclaw.key`. → The session name is
  operator-configurable and derived from the account id by default; document
  it, and detect the bind failure with a legible error.
- **A destructive drain plus a durable queue is still two systems.** → The
  ordering guarantee is only as good as the durable append; keep the batch
  small and the chokepoint single, per D6.
- **A2UI surfaces are a differentiator the other channels lack**, so an agent
  prompt tuned for text may never produce the structured choices that trigger
  them. → The text fallback means nothing breaks; richness is opportunistic.
- **`send_file` never queues.** An attachment to an offline phone fails where a
  text message would have queued. → Surface it as a send error the agent can
  retry, and do not silently drop it.

## Migration Plan

Nothing to migrate — this is additive across the board. Deployment order:

1. Land the `azula-cli` tools; they are inert for existing clients.
2. Release an azula CLI carrying them (Sal's go-ahead, per the version-tag
   rule).
3. Publish `@azula-app/openclaw`; install it into the gateway and configure one
   account.

Rollback is `openclaw plugins remove` — the CLI tools can stay, since nothing
else calls them.

## Open Questions

- Which OpenClaw outbound shapes actually carry structured choices in practice
  (approvals, `askUser`-style prompts, tool confirmations) determines how much
  of D4 fires day one. This changes how rich the surfaces are, not whether the
  mapping exists, so it can be settled while building against a real gateway.
- Whether the inbound pump should also translate `connected`/`disconnected`
  into OpenClaw presence signals, if the SDK exposes any, or keep them purely
  internal as the spec currently requires.
