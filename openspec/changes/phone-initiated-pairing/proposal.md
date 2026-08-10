## Why

Pairing only works in one direction. A phone can redeem an invite the CLI
minted, but the reverse — the user taps "＋ connect a peer", copies the
`https://azula.app/i/…` link, and runs `azula pair <url>` — cannot work at
all: `azula pair` succeeds, prints "Paired device", writes a registry entry,
and every subsequent connection is closed by the app without the invite ever
being read. The MCP bridge advertises the same dead end in its own tool
instructions ("call `connect` with a share code the user copies from their
app").

Part of this is already a conformance gap rather than a missing feature.
`invitations`' "Session Certificates Admit Strangers Without an Invite" says a
failed cert check "SHALL fall through to the ordinary invite verification
path, never to an error that blocks the invite path", with no ALPN qualifier.
The app honours that on `azula/chat/0` only; on `azula/llm/0` and
`azula/term/0` it closes the stream instead
(`ConnectService.handleStrangerConnection`). The CLI's sole dial path
(`core::device::dial_device`) hardcodes the LLM ALPN, so the one direction a
CLI can dial is the one direction the gate refuses.

## What Changes

- The app's invite gate applies to every ALPN it accepts, not just CHAT. An
  invite-bearing stranger on `azula/llm/0` or `azula/term/0` is verified and
  becomes a pending request exactly as it does on `azula/chat/0`. An
  invite-*less* stranger on those ALPNs is still closed — that part of
  today's behaviour is deliberate and stays.
- `azula pair` becomes a real handshake instead of a local registry write. It
  dials the issuer, presents the invite, and waits (bounded) for the user to
  accept on the phone, reporting approval, decline, or timeout distinctly. It
  registers the device only on approval.
- **BREAKING**: `azula pair` now performs network I/O and can fail. Today it
  only ever fails on a malformed URL. Scripts that treated it as an offline
  bookkeeping command will need to handle a non-zero exit for decline or
  timeout.
- A redeemer waiting on approval keeps its connection open and re-presents its
  invite on reconnect. The app stops closing a second connection from an
  endpoint that already has a pending request, which today makes a retrying
  redeemer unreachable until the first request is resolved.
- `start_pairing`'s minting requirement is corrected to match what shipped in
  azula-cli `b3ee650`: the invite embeds the **session** endpoint's ticket,
  because `invite::verify_inbound` binds both the ticket's endpoint id and the
  signature to the verifying endpoint, and the accept gates verify as the
  session. The requirement's intent — pair with the machine once, not per
  session — is unchanged and still carried by `Hello.cert` root pinning.

Out of scope: `azula message send` reporting `ok` for a frame the app
discarded. That is `cli-send-delivery-truthfulness`, already proposed, and it
is what makes the failure mode here silent rather than what causes it.

## Capabilities

### New Capabilities

None. This is a correction and extension of existing pairing behaviour.

### Modified Capabilities

- `invitations`: the accept gate's invite path spans every accepted ALPN, not
  CHAT alone; a redeemer awaiting approval holds its connection and may
  reconnect without being refused for having a pending request.
- `cli-surface`: `azula pair` becomes a connecting, waiting command with
  distinct outcomes for approved, declined, and timed-out, and registers only
  on approval.
- `mcp-bridge`: "Stable Bridge Identity"'s `start_pairing` minting sentence is
  corrected from the machine identity to the session identity, preserving the
  pair-once-per-machine intent.

## Impact

- `azula-app`: `shared/src/dev/azula/state/ConnectService.kt`
  (`handleStrangerConnection` ALPN branch),
  `shared/src/dev/azula/state/InviteService.kt` (`enqueuePending`'s
  duplicate-endpoint guard). `mock-support/test/StrangerGateTest.kt` asserts
  today's LLM/TERM closure as intended behaviour and must be rewritten — the
  invite-less cases stay, the invite-bearing cases invert.
- `azula-cli`: `src/cli/legacy.rs` (`cmd_pair`), `src/core/device.rs`
  (dial + invite presentation on reconnect), `src/core/mod.rs`. The MCP
  `connect` tool shares this path and inherits the fix.
- `azula-docs`: delta specs for `invitations`, `cli-surface`, `mcp-bridge`.
- No wire-format change. The invite payload, `Hello` frame, and ALPN strings
  are all untouched; only which connections the gate is willing to consider.
