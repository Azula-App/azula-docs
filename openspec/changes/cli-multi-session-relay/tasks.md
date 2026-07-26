# Tasks — cli-multi-session-relay

## 1. Session identity (azula-cli)

- [x] 1.1 Machine key: `identity.rs` gains `machine` identity that adopts `bridge.key` (read fallback, rewrite as `machine.key`); node id unchanged for existing pairings
- [x] 1.2 Session certs: `certs.rs` gains `FLAG_SESSION`; mint/verify session certs (machine root → session key, default 7d expiry); self-certified form (`device_pk == root_pk`) for headless
- [x] 1.3 Session key management: `--session NAME`/`AZULA_SESSION` → `~/.azula/sessions/<name>.key`; ephemeral per-process keys under `$TMPDIR/azula/sessions/` cleaned on exit; default `cli` session for one-shot verbs, fresh ephemeral for `mcp`/`run`/`terminal`
- [x] 1.4 Endpoint setup: every entry point binds a session key and sends `Hello{cert}`; `start_pairing`/startup banner mint machine-identity invites; headless (no machine key) path prints self-certified invite URL + QR and waits
- [x] 1.5 Rust tests: cert mint/verify/expiry/session-flag matrix, bridge.key migration, session-key persistence/ephemerality

## 2. CLI surface (azula-cli)

- [x] 2.1 Restructure `main.rs` into noun-verb commands (`message send|recv`, `ui render|update|delete|catalog`, `file send`, `watch`, `status`, `mcp [--http]`, `relay`, `run`, `terminal …`); keep `serve-mcp`/`mcp`/`serve`/`mailbox` as deprecated aliases printing a stderr notice
- [x] 2.2 Extract `SessionCore` from `bridge/` (connect/registry/delivery/A2UI/inbox); MCP `#[tool_router]` and CLI verbs both call it; MCP tool names/behavior unchanged
- [x] 2.3 `--json` output on every verb; `watch --json` JSONL event stream (`message`/`ui_event`/`file`/`connected`/`disconnected` + `device`); `status --json` (machine identity, devices, active sessions)
- [x] 2.4 `ui render` from file/stdin with client-side root validation; `ui update` pointer+value; single shared catalog string surfaced via `ui catalog`, `ui render --help`, and the MCP tool description
- [x] 2.5 Rust tests: JSONL contract snapshots, stdin render validation, alias deprecation notices

## 3. Terminal handoff + sessions (azula-cli)

- [x] 3.1 `azula run`: PTY wrapper with stdout/stderr mirroring, ring-buffer capture, `--handoff on-error|always|never`, `--hold` (default 60m); on trigger spawn `$SHELL` into the same session (same cwd/env) and print the connect block; preserve original exit code
- [x] 3.2 `azula terminal` (interactive host) and `terminal new --cmd --name` (detached daemonized host, runtime state file), `terminal list`, `terminal kill`
- [x] 3.3 `terminal attach <name|url>`: raw-mode passthrough client (bytes both ways, resize propagation, replay on attach)
- [x] 3.4 `term.rs` attach authorization: creating peer OR redeemer of the session's own invite gets the held session; others get a fresh one
- [x] 3.5 Rust tests: run-wrapper exit-code/handoff matrix, invite-authorized attach, two detached sessions concurrently

## 4. Relay (azula-cli)

- [x] 4.1 Rename `mailbox_role.rs` role to relay (`azula relay`, `link --relay`; `mailbox`/`--mailbox` aliases; wire role bit unchanged)
- [x] 4.2 `eventlog.rs`: add `agent_in` (0x09) / `agent_out` (0x0A) kinds with bodies per the account-sync delta; fold/dedup rules; cross-language vector entries
- [x] 4.3 Relay admission gate for sessions (cert chains to a machine root that is a known contact) + append `agent_in` on relay's log
- [x] 4.4 Delivery chain in `SessionCore`: direct → relay (when hint known) → local JSONL mailbox; `relay_hint` parsing/persistence in `devices.json`
- [x] 4.5 A2UI snapshot side store on the relay: latest per `(conversation, surface_id)`, 256 KiB cap, tombstones; session-side coalescing of render/update/delete into snapshots when phone unreachable
- [x] 4.6 Snapshot replay to the phone after sync catch-up, then clear pending; wire format for snapshot delivery (session→relay and relay→phone)
- [x] 4.7 Rust tests: never-concurrently-online agent delivery via relay, snapshot coalescing/replay/tombstone, delivery-chain fallback order, oversized snapshot rejection

## 5. App: session accept + conversations (azula-app)

- [x] 5.1 Accept gate: session-cert path (5 checks: signature, expiry, session flag, known machine contact, transport binding); failure falls through to invite gate
- [x] 5.2 Auto-create flat conversation for an admitted session (title/description from `Profile`); expired-session reconnects re-validated; bulk-archive expired session conversations
- [x] 5.3 Send `relay_hint` (enrolled relay ticket) to a machine on pairing accept
- [x] 5.4 Kotlin tests + `-mock` coverage for the accept path and conversation creation

## 6. App: agent kinds + A2UI replay (azula-app)

- [x] 6.1 `EventLog.kt`/fold: `agent_in`/`agent_out` kinds, session-pk conversation keying, id dedup, notification on new relayed `agent_in`
- [x] 6.2 Receive A2UI snapshot replay from the relay connection and apply as ordinary A2UI messages in the session's conversation
- [x] 6.3 Kotlin tests incl. cross-language vector extension for the new kinds

## 7. Distribution

- [x] 7.1 Release workflow in azula-cli: `v*` tag → 4-target build matrix (darwin arm64/x64, linux musl x64/arm64) → GitHub Release artifacts
- [x] 7.2 crates.io publish (lib + bin; demos excluded); verify crate-name availability, adjust metadata
- [x] 7.3 npm: per-platform packages + meta launcher package; `npx <meta> mcp` path verified; name availability checked
- [x] 7.4 Homebrew tap repo + formula; workflow pushes version/sha bumps
- [ ] 7.5 Verify relay-only (no-UDP) operation and document proxy allowlist hosts for Claude Code web containers; README + azula-site install pointers

## 8. Docs + archive

- [x] 8.1 Update `mcp-bridge/design.md`, `terminal/design.md`, `account-sync/design.md` prose for the new architecture; new `cli-surface`/`session-identity`/`relay`/`cli-distribution` design.md pages
- [x] 8.2 Update `project.md` (device registry section, build/verify, command names). `azula-cli/README.md` NOT updated: its Install section already reflects the distribution work (phase 7), but everything from "## Build" onward (tool catalog, wire protocol, crate layout) still documents the pre-restructure `serve`/`serve-mcp`/`pair`-only CLI — task assumed an earlier phase had done this pass; it hadn't. Flagged in `project.md`'s Project map and left as a follow-up (not edited here per this phase's scope — docs-repo-only).
- [x] 8.3 `openspec validate --all` clean (23/23 passed, including this change with `--strict`); archive is a separate step for the orchestrator/a follow-up `/opsx:archive` run, not performed by this phase.

## 9. Deferred follow-ups (discovered during implementation)

- [ ] 9.1 `--json` for the remaining legacy verbs (`pair`, `invite`, `invites`) — `devices`/`status`/`watch`/new verbs have it
- [ ] 9.2 Relayed "session online" attach notification from `azula run`/`terminal new` hosts holding a machine identity (TODO(phase 4) hook in `terminal_cmd.rs`/`run_cmd.rs` — relay delivery chain now exists, wire it up)
- [ ] 9.3 First release: create tap repo + npm org, add CARGO_REGISTRY_TOKEN/NPM_TOKEN/TAP_PUSH_TOKEN secrets, re-check name availability, push v* tag (needs maintainer go-ahead)
- [ ] 9.4 Kotlin-side notification for synced peer `message_in` (only `agent_in` notifies today; pre-existing gap made visible by phase 6)
