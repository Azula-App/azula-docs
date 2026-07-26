# cli-multi-session-relay — the azula CLI, multi-session identity, and the relay

## Why

The current CLI is bridge-shaped, not user-shaped: one persistent `bridge.key`
identity per machine means exactly one MCP server can talk to the phone at a
time (two processes sharing a node id collide; HTTP mode additionally holds one
port), so concurrent Claude Code sessions, CI jobs, and scripts cannot each
hold their own conversation. There is no first-class way to hand a failing
terminal (local or CI) to the phone, no way to reach the phone from an
ephemeral container, offline delivery dies when the laptop sleeps, and the CLI
is not published anywhere — every machine builds it from source.

## What Changes

- **Per-session identity.** Every azula process (an MCP session, a terminal
  host, a script) mints an ephemeral session keypair certified by the
  machine's stable azula identity, reusing the `azd…` certificate format. The
  phone pairs with the machine once and then auto-accepts any session whose
  cert chains to it — each session is naturally its own conversation (the app
  already keys conversations by node id). Headless/ephemeral environments
  (Claude Code web containers, CI runners) carry no standing credential:
  each session prints a pairing URL/QR and the user approves it from the
  phone ("scan per session").
- **New CLI surface.** Noun-verb commands — `azula message`, `azula ui`,
  `azula terminal`, `azula run`, `azula watch`, `azula mcp`, `azula relay`,
  `azula pair`/`devices`/`invite` — with JSONL output contracts so scripts and
  LLMs can drive everything the MCP tools can (the blackjack pattern:
  shell out for `ui render`/`ui update`, follow `azula watch --json` for
  events). The MCP server and the CLI verbs share one core. **BREAKING**:
  `serve-mcp`/`mcp`/`serve` become aliases for one release, then go.
- **Terminal handoff.** `azula run [--handoff on-error] -- <cmd>` runs a
  command in a captured PTY; on failure it prints the pairing URL/QR (CI-log
  friendly) and holds the session open with full scrollback so the phone
  attaches exactly where the command died. Standalone `azula terminal` hosts
  a fresh shell (same cwd/env) interactively, and `azula terminal new/list/
  attach/kill` manages arbitrarily many named persistent sessions on top of
  the existing attach/replay machinery in `term.rs`.
- **The relay.** The mailbox role generalizes to `azula relay` (old name kept
  as an alias): one always-on sibling that live-forwards when the phone is
  online (sync live-push, two sub-second hops) and stores-and-forwards when it
  isn't — now also carrying agent/bridge chat, notifications, and A2UI
  surface snapshots (latest-per-surface replay on reconnect). Interactive
  terminal traffic stays direct P2P; large files stay live-only.
- **Distribution.** Release CI publishes the CLI to a Homebrew tap, to
  crates.io (binary + the `azula` library crate), and as an npm wrapper so
  `npx azula` works anywhere node does — including Claude Code web
  containers and portable `mcp.json` entries.

## Capabilities

### New Capabilities
- `cli-surface`: the azula CLI command taxonomy, JSONL input/output
  contracts, MCP/CLI parity, and the embedded A2UI catalog docs
  (`--help`-discoverable so an LLM can learn the surface from the CLI alone).
- `session-identity`: machine identity, per-session certified keys,
  scan-per-session pairing for headless environments, and the phone-side
  auto-accept + flat per-session conversations.
- `relay`: the always-on relay role — live forwarding, store-and-forward,
  agent chat + notification + A2UI snapshot carriage — subsuming the mailbox
  role.
- `cli-distribution`: the release pipeline and install channels (Homebrew
  tap, crates.io, npm wrapper).

### Modified Capabilities
- `mcp-bridge`: bridge identity becomes per-session (machine identity +
  session certs) instead of the single `bridge.key`; tools and CLI verbs
  share one core; `render_ui` and notifications gain relay-backed offline
  behavior (today they are live-connection-only and fail fast).
- `terminal`: adds the run-wrapper handoff requirement, arbitrary named
  session spawning/management, and hosting sessions under session identities.
- `account-sync`: new event kinds for agent conversations, notifications,
  and A2UI surface snapshots, with their fold rules (LWW per surface for
  snapshots).
- `invitations`: the accept gate honors a session cert chaining to an
  already-paired machine identity as a known peer (no invite, no prompt).
- `device-linking`: the certificate format gains a session kind/role with
  short expiry, distinct from sibling-device enrollment.

## Impact

- `azula-cli` — major restructure: command taxonomy, session identity in
  `identity.rs`/`certs.rs`, bridge core reuse, `run` wrapper, relay role,
  release metadata. The `azula` lib crate becomes a published API.
- `azula-app` — accept-gate extension for session certs, auto-created flat
  conversations (name/description from the session), relay sync of the new
  event kinds, A2UI snapshot replay.
- `azula-site` — install page/script pointers and docs for the new pairing
  flows (routes for `/i/` links unchanged).
- Release infrastructure — new CI workflows in `azula-cli` for tag-driven
  publish (Homebrew tap repo, crates.io, npm).
- `azula-docs` — this change's specs merge into `specs/` on archive.
