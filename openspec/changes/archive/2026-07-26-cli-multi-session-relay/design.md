# Design — cli-multi-session-relay

## Context

Today `azula-cli` is bridge-shaped: `azula mcp`/`serve-mcp` load one persistent
key (`~/.azula/bridge.key`), so all processes share one endpoint id — two
concurrent bridges collide, which is the "one MCP server per computer" limit.
The pieces this design composes already exist:

- The app keys conversations by **peer endpoint id** (`terminal/design.md`), so
  distinct session keys naturally produce distinct conversations.
- `certs.rs` / device-linking define the `azd…` certificate format (root signs
  device certs, role flags, expiry) and `accept_gate::CertGate` admits peers
  presenting a cert chaining to a known root.
- `azula mailbox` (`mailbox_role.rs`) is already a store-and-forward sync
  sibling with **live push** — "relay" is a generalization, not a new system.
- `term.rs` already has persistent PTY sessions with attach/replay
  (`term_attach`/`term_session`, ring buffer, TTL reaping).

Decided with the user: per-session keys + certs; flat conversations on the
phone; `azula run` wrapper + standalone `azula terminal`; mailbox generalizes
to `azula relay` carrying agent chat, notifications, and A2UI snapshots;
headless environments use scan-per-session (no standing credential);
distribution via Homebrew tap + crates.io + npm wrapper; A2UI programmatic
surface is CLI verbs + JSONL events.

## Goals / Non-Goals

**Goals:**

- N concurrent conversations (MCP sessions, terminals, scripts) between one
  computer and the phone, each its own conversation row.
- Pair a machine once; sessions on it need no further approval. Ephemeral
  environments (Claude Code web container, CI) pair per session via URL/QR.
- Seamless CI handoff: command fails → connect info in the log → phone (or
  another CLI) attaches to the held PTY with full scrollback.
- Arbitrary named persistent terminal sessions spawned/managed from the CLI.
- Offline delivery that survives the laptop sleeping, via an always-on relay.
- CLI verbs with JSONL contracts so a script or LLM can do everything the MCP
  tools can (the blackjack pattern), and the two share one core.
- Published installers: `brew install`, `cargo install`, `npx azula-cli`.

**Non-Goals:**

- Threads-within-one-conversation on the phone (flat conversations chosen).
- Syncing A2UI surface history across the identity's devices (snapshots are
  ephemeral, latest-only, phone-bound).
- Relaying interactive terminal traffic (stays direct P2P; latency and log
  bloat make relayed terminals a bad fit).
- New transport infrastructure — iroh's own relays keep doing NAT traversal;
  `azula relay` is an application-level role on the user's own hardware.
- A local multiplexing daemon (rejected in favor of per-session keys).
- Large-file store-and-forward (files stay live-connection-only).

## Decisions

### D1. Session identity: machine root + per-session `azd` certs

Each azula **machine** has a stable identity key. `~/.azula/bridge.key` is
adopted as-is and renamed `machine.key` (read `bridge.key` as fallback, write
`machine.key`) — existing phone pairings keep working because the machine's
endpoint id is unchanged, and the phone already knows it as a contact.

Each azula **process** (an `azula mcp` server, an `azula run` handoff, a
scripted `--session`) holds a session keypair whose `azd…` certificate is
signed by the machine key: `root_pk` = machine pk, `device_pk` = session pk, a
new `FLAG_SESSION` role bit, short expiry (default 7 days, `--expires`
override). The cert travels in `Hello{cert}` (field already exists in the
wire format). The phone's accept gate gains one path: a stranger presenting a
valid, unexpired `FLAG_SESSION` cert whose `root_pk` matches an
already-paired machine contact and whose `device_pk` matches the transport
peer id is admitted **without invite or prompt**, and a conversation is
auto-created (named by the session's `Profile` frame, as today).

Rationale: no daemon, no port, no lifecycle management; works identically on
a dev machine and inside a container; N sessions is the default, not a mode.
Alternative rejected: a local daemon multiplexing one connection — needs
app-side multi-conversation-per-peer changes, daemon lifecycle, and a unix
socket that doesn't exist in a fresh container.

Revocation: none for individual sessions in v1 — expiry bounds exposure, and
the phone can delete/block a conversation manually. Revoking the *machine*
pairing (forget the contact) kills all its sessions at once.

### D2. Session persistence and naming across CLI invocations

One-shot verbs must land in the *same* conversation across invocations (a
blackjack script shells out dozens of times). A session is named by
`--session <name>` / `AZULA_SESSION`, with its key stored at
`~/.azula/sessions/<name>.key` (created on first use). Defaults:

- One-shot CLI verbs (`message`, `ui`, `watch`): session name `cli` — casual
  use from any terminal shares one "CLI" conversation.
- `azula mcp`: a **fresh ephemeral session per process** (random suffix) —
  each Claude Code window gets its own conversation, which is the whole
  point. `--session <name>` opts into a stable one.
- `azula run` / `azula terminal`: fresh ephemeral session per invocation.

Ephemeral session keys live under `$TMPDIR/azula/sessions/` and are deleted
on clean exit; named ones persist. `azula sessions` lists both (from runtime
state files, see D5).

### D3. Headless pairing: scan-per-session, self-certified

A process with no machine key (fresh container, CI runner) self-certifies:
the session key doubles as its own root (`device_pk == root_pk`, the same
shape as the app's upgrade-in-place self-cert) and the process prints a
standard signed invite — `https://azula.app/i/<azi…>` plus a Unicode QR — and
waits. The user approves from the phone exactly like any invite (scan, or
tap the link when viewing CI logs on the phone — the `/i/` deeplink opens the
app). No secret ever lives in the container; each session is approved
individually, by explicit user choice.

Consequence accepted: a CI failure handoff requires one scan/tap before the
phone can attach. When the environment *does* have a machine key (the normal
dev-machine case), no scan is needed and `azula run` can additionally send a
"build failed — attach here" agent message through the relay (D6) so the
phone gets a push without the user watching CI.

### D4. CLI surface: noun-verb, JSONL everywhere, one core

```
azula pair <url> | devices | invite | qr | link      # existing, kept
azula mcp [--session NAME] [--device URL]            # stdio MCP (serve-mcp/--http for HTTP)
azula message send  [--device D] TEXT                # queues via relay if offline
azula message recv  [--device D] [--wait SECS]       # one-shot drain / long-poll
azula watch [--json]                                 # follow inbox: JSONL events
azula ui render  [--device D] [--surface ID] FILE|-  # components JSON from file/stdin
azula ui update  [--device D] --surface ID PTR VALUE # RFC 6901 pointer update
azula ui delete  [--device D] --surface ID
azula ui catalog                                     # print the A2UI component catalog
azula file send  [--device D] PATH [--caption TEXT]
azula run [--handoff on-error|always|never] -- CMD…  # PTY wrapper + handoff
azula terminal [new|list|attach|kill] […]            # host/manage/attach sessions
azula relay                                          # the always-on role (alias: mailbox)
azula status                                         # runtime state, JSON
```

- Every verb takes `--json` for machine-readable output; `watch --json` emits
  one JSON object per line: `{"type":"message"|"ui_event"|"file"|"connected"|
  "disconnected", "device":…, …}` — the CLI mirror of `get_messages`/
  `wait_for_reply`.
- `azula ui catalog` and the long `--help` texts embed the same component
  catalog the `render_ui` MCP tool description carries (single source in the
  crate, referenced by both) — an LLM can learn the surface from the CLI
  alone, which is the a2ui capability's "three places" sync rule extended to
  a fourth consumer that shares the same source string.
- The MCP tools and CLI verbs call one `SessionCore` (connect/registry/
  relay/mailbox/A2UI/inbox logic extracted from today's `bridge/`); the MCP
  layer is a thin `#[tool_router]` over it, the CLI a thin clap layer.
  Tool names/behavior stay compatible.
- **BREAKING (staged):** `serve-mcp`, `mcp`, `serve` remain as aliases for one
  release with a deprecation note, then are removed. `azula serve`'s LLM-relay
  demo mode is dropped (superseded); its terminal hosting moves to
  `azula terminal`.

### D5. Terminal: `azula run` handoff + named persistent sessions

`azula run [--handoff on-error] -- cmd args…` runs the command in a PTY
(reusing `term.rs`'s session registry + 256 KiB ring buffer), mirroring
output to the real stdout/stderr so CI logs are unchanged. On trigger
(nonzero exit for `on-error`; startup for `always`):

1. Keep the session's ring buffer; spawn `$SHELL` in the same session, same
   cwd/env — the attach replay therefore shows the failed command's output
   followed by a live prompt ("continue where execution left off").
2. Print the connect block: session invite URL + QR (D3) — or, with a
   machine key, just a named-session line plus a relayed "attach here" agent
   message to the phone (D3/D6).
3. Hold the process open until the session ends or `--hold` (default 60 min)
   expires, then exit with the *original* command's exit code so CI still
   reports the failure.

`azula terminal` (no subcommand) hosts a fresh interactive shell the same
way. `azula terminal new [--cmd "claude …"] [--name N]` spawns a **detached**
background process hosting one persistent session (its own session key,
runtime state file under `$TMPDIR/azula/sessions/<name>.json`) — this is
"spin up arbitrary amounts of sessions (claude with remote control) from the
command line". `list`/`kill` read/manage those state files.
`azula terminal attach <name|url>` is the CLI **client**: raw-mode
passthrough of PTY bytes to the local terminal (no emulator needed), so a
session started in CI or on another machine can be continued from a laptop
shell, not only from the phone. Owner-binding in `term.rs` relaxes to: the
creating peer *or* a peer redeeming the session's own invite may attach;
`term_attach` from other peers still gets a fresh session.

### D6. The relay: mailbox generalized, three traffic classes

`azula relay` replaces `azula mailbox` (kept as alias). It remains an
identity sibling device (enrolled via `azula link --relay`, role bit renamed
with `FLAG_MAILBOX` kept as the wire value) serving chat/sync/link ALPNs.
What's new is what it carries:

- **Agent chat.** Two new log event kinds, `agent_in` (0x09) and `agent_out`
  (0x0A), body `{conversation, text, id?, from_name?}` where `conversation`
  is the session pk hex. When a session cannot reach the phone directly, it
  dials the relay (admission: the session's cert chains to a machine root
  that is a known contact of the identity — the same gate as D1, applied by
  the relay) and delivers; the relay appends `agent_in` on its own log.
  The phone folds these kinds into the session's conversation and fires its
  normal message notification. Live path is unchanged: when the phone is
  reachable, frames go direct and nothing touches the log. The phone learns
  its relay exists today via device-linking; sessions learn it via a new
  `relay_hint` field the phone includes when a machine pairs (persisted per
  device in `devices.json`), so a session's delivery order is: phone direct →
  relay → local JSONL mailbox (existing, now last-resort when no relay).
- **Notifications** are just agent messages — no dedicated kind; the phone's
  existing new-message notification path covers "build failed, attach here".
- **A2UI snapshots** deliberately stay **out of the hash-chained log** (a
  blackjack game would append a full surface copy per card flip, forever, on
  every device). The relay keeps a bounded side store: latest snapshot per
  `(conversation, surface_id)` — `{components, data_model, lamport}`,
  tombstone for delete, 256 KiB cap per surface, overwritten in place. A
  session that can't reach the phone sends `render_ui`/`update_ui` results to
  the relay as a **coalesced full snapshot**; when the phone next connects to
  the relay, pending snapshots replay as ordinary `a2ui`
  createSurface/updateComponents/updateDataModel frames after sync catch-up.
  `update_ui` against an offline phone therefore works iff the session holds
  the full surface (it does — it rendered it); the MCP tools' "live
  connection required, fail fast" contract for `render_ui`/`update_ui`/
  `delete_ui` is replaced by "queued to relay" when a relay is known.
- **Reverse direction (phone → dead session):** replies to a session that no
  longer exists deliver nowhere; they remain in the phone's history. `azula
  watch`/a running session receives live replies as today. Documented
  limitation.

Privacy note: the relay is the user's own enrolled device and already holds
the identity's full logs by design; agent chat riding the same log adds no
new trust party.

### D7. Distribution: one tag, three channels

`azula-cli` gets a release workflow on `v*` tags:

1. Build matrix: `aarch64-apple-darwin`, `x86_64-apple-darwin`,
   `x86_64-unknown-linux-musl`, `aarch64-unknown-linux-musl` (static musl so
   containers need no glibc match). Artifacts attach to a GitHub Release
   (the artifact host for the other channels, not a user-facing channel
   itself).
2. **crates.io**: publish the `azula` crate (lib + `azula` bin). The demos
   crate stays unpublished.
3. **npm**: esbuild-style layout — platform packages
   (`@azula-app/cli-darwin-arm64`, …) each carrying one binary, plus a meta
   package `azula-cli` with a tiny launcher that resolves the right optional
   dependency. `npx -y azula-cli mcp` then works anywhere node does — the
   Claude Code web container path, and a portable `mcp.json` entry:
   `{"command": "npx", "args": ["-y", "azula-cli", "mcp"]}`.
4. **Homebrew**: a `homebrew-azula` tap repo whose formula downloads the
   GitHub Release binaries; the release workflow pushes the version/sha bump.

Version source of truth is the workspace `Cargo.toml`; npm/formula versions
are stamped by the workflow. Name availability on npm/crates must be checked
at implementation time (fallbacks: scoped npm name, `azula-cli` on crates).

### D8. Claude Code web container constraints

- Networking: containers typically allow only proxied HTTPS. iroh must run
  with relay-over-HTTPS fallback (no UDP) — the n0 relay hosts need to be
  reachable through the proxy allowlist. Task: verify a container can dial
  the phone relay-only, and document the required allowlist entries; if the
  default n0 relays are blocked, `azula relay` hosting a user-controlled
  iroh relay is out of scope — document the limitation instead.
- No keychain, ephemeral filesystem: fine — scan-per-session (D3) means no
  standing secrets; session keys are ephemeral by design.
- Install: `npx -y azula-cli` (D7); document in README + site.

## Risks / Trade-offs

- **[Scan friction in CI]** Every CI handoff needs one scan/tap → accepted
  by explicit user choice (zero standing secrets). Mitigated on dev machines
  by machine-key auto-accept, and the `/i/` link being tappable straight
  from CI logs viewed on the phone.
- **[Session-cert forgery surface]** The phone now auto-accepts strangers
  presenting a cert — the gate must verify: signature by `root_pk`, expiry,
  `FLAG_SESSION`, `root_pk` ∈ paired machine contacts, and
  `device_pk == transport peer id`. Any miss is a spoofing hole; spec pins
  all five checks, mirroring the sync-hello checklist in `account-sync`.
- **[Log growth from agent chat]** Verbose agent conversations now live in
  the permanent identity log on every device. Accepted for v1 (text only,
  A2UI kept out); a retention/compaction policy is future work if it bites.
- **[Conversation-list clutter]** Fresh-session-per-MCP-process means dead
  conversations accumulate. Mitigated by cert expiry (the app can visually
  age-out/collapse expired session conversations) — app-side cleanup UX is
  spec'd as "expired sessions are archivable in bulk".
- **[Unknown event kinds on old devices]** `agent_in`/`agent_out` ride the
  existing unknown-kind passthrough — old siblings store and re-serve them
  without folding. Already proven behavior; no version negotiation needed.
- **[iroh relay reachability from containers]** If the proxy blocks n0
  relays, the container story fails → verification task early in the plan
  (it gates nothing else; worst case the feature ships documented as
  "requires allowlisting").
- **[Same-machine session proliferation]** Dozens of live endpoints from one
  box (one per session). Each endpoint is cheap (QUIC socket + key), but
  `azula sessions`/`status` must make the population visible and reapable.

## Migration Plan

1. Ship the CLI restructure with old commands as aliases; `bridge.key` is
   read as the machine key and rewritten as `machine.key` on first run.
   Existing `devices.json` pairings keep working (endpoint id unchanged).
2. App update ships the session-cert accept path + new fold kinds first
   (passthrough makes ordering safe); CLI features that need the app
   (auto-accept, relay A2UI replay) degrade to today's behavior against an
   old app (invite prompt; live-only A2UI).
3. Relay operators: `azula mailbox` keeps working as an alias; re-running
   `azula link` is not required (role bit value unchanged).
4. Rollback: everything new is additive on the wire (`Hello.cert` field
   exists; new event kinds pass through) — reverting the CLI restores today's
   behavior without data loss. The one release removing the aliases waits
   until the app + docs have shipped.

## Open Questions

- npm/crates.io package-name availability (`azula-cli`, `@azula-app/*`) —
  check at implementation; fallbacks listed in D7.
- Session cert default expiry: 7 days chosen; revisit if conversation-list
  aging UX wants shorter.
- Whether `azula ui catalog` should emit JSON schema in addition to prose
  (nice for LLM tool-builders; cheap to add later).
