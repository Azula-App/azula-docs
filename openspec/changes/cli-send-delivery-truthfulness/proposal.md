## Why

`azula message send` prints `ok` for messages the recipient will never see.

`core::send_message` (`azula-cli/src/core/mod.rs:663-666`) returns
`SendOutcome::Sent` the moment four frames are handed to the QUIC send
stream. No acknowledgement is read. The app, meanwhile, closes the stream
outright when a pending request from that endpoint is already queued —
`InviteService.enqueuePending`'s `pending.any { it.endpointId == endpointId }`
guard, in `azula-app/shared/src/dev/azula/state/InviteService.kt`. So the
common case of "I paired, the phone hasn't approved yet, let me send
something" reports success and delivers nothing.

Underneath it is a staler bug: `connect_device`
(`azula-cli/src/core/device.rs:131-164`) sets `conn.connected = true` on a
successful dial plus a `Hello` write, never waiting for a reply, and nothing
ever flips it back when the peer hangs up — `reader_loop` simply ends. A
device that closed on us reads as connected forever, which misreports
`status` and `watch`, not only `send`.

Split out of `cli-naming-and-registry-keying`, which fixes the pairing and
registry defects found in the same session. This one is held separate because
the most precise fix needs an app-side protocol change, and that decision
should not gate a data-loss fix.

## What Changes

- A message is no longer reported as sent on the strength of a completed
  local write. Direct delivery counts as sent only while the peer's stream is
  live.
- A send the peer refused enters the existing delivery chain — relay, then
  local mailbox — rather than being dropped, so the fix improves delivery and
  not merely reporting.
- A refused connection is reported distinctly from an offline queue, so a
  caller can tell "stored for later" from "the far side hung up".
- A connection whose reader has ended is marked disconnected, so `status`,
  `watch`, and later sends stop showing a peer that hung up as live.
- Applies to the MCP `send_message` tool and the CLI verb alike, since both
  go through `core::send_message` per cli-surface's "CLI and MCP Share One
  Core".

The mechanism is not settled — see `design.md`, which lays out three options
and recommends one. That choice is the first thing to resolve at apply time.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `mcp-bridge`: *send_message and say Have Mailbox Fallback* — today the
  requirement covers every fallback with "report the message as queued
  rather than failing"; a peer that closed the stream is a case it does not
  cover and which is currently reported as sent.
- `cli-surface`: *JSON Output Contracts* — `azula message send --json` gains
  a status for the refused case alongside `sent`/`queued`.

## Impact

- **azula-cli**:
  - `src/core/mod.rs` — `send_message` returns `Sent` on write completion
    (~L663); `SendOutcome` gains a variant.
  - `src/core/device.rs` — `connected` set optimistically (~L159);
    `reader_loop` (~L151, L173) ends without resetting it.
  - `src/cli/message.rs` — prints the bare `ok` (L58) and the `--json`
    status (L55-59).
  - `src/mcp.rs` — the tool's result mapping needs checking rather than
    assuming it inherits the new outcome.
- **azula-app** — only if the protocol option in `design.md` is chosen; the
  recommended option needs no app change.
- **Interacts with `invitations-legacy-sunset`**: once the legacy hatch
  closes, awaiting the peer's `Hello` becomes viable as a positive admission
  signal (see `design.md` decision).
- **Verification** per `specs/testing/`: `cargo test --workspace` and
  `cargo clippy --workspace --all-targets`.
