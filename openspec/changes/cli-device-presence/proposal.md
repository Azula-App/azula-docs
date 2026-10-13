# Keep a long-lived session connected to its devices

## Why

On 2026-10-12 the OpenClaw gateway on houston restarted its
`azula mcp --session openclaw` (a plugin reinstall), and the phone paired to
that session showed the conversation **offline** from then on. Nothing ever
brought it back. Three defects compound:

1. **A dropped connection was never noticed.** `connected` was cleared only by
   an explicit `disconnect`; the dial-side reader loop and the accept-side read
   loop both returned on EOF without touching it. After a drop the device still
   read as connected, so `list_devices`, `bridge.json` and `status` lied, and
   `ensure_device` never redialed on the next send.
2. **A phone that paired by dialing in could never be dialed back.** The accept
   side registers such a device under its bare endpoint id, but `dial_device`
   parsed only full `EndpointTicket`s, so every dial of that row failed at once
   ("wrong prefix"). Every invite-paired phone was undialable — including the
   startup dial after a gateway restart. `match_known_device` had the same blind
   spot and treated a returning bare-id phone as a stranger.
3. **Nothing maintained presence.** The startup dial was a single attempt, and
   the 25 s loop retried only devices with queued mail.

The app makes this the CLI's job: a conversation is online only while a stream
is wired to it, and the app deliberately never redials a session it was dialed
by (it has no ticket for it). So a session that stops dialing stays offline.

## What Changes

- The bridge marks a device disconnected the moment its connection ends, on
  either side, and emits the `disconnected` event `get_events` already
  documents; it emits `connected` on every down→up transition, including a
  phone that dials in (the plugin's harness expected one and never got it).
- A long-lived session keeps every known device connected: a device seen down
  is redialed with backoff from 5 s up to 60 s (25 s while it has mail
  queued), and each reconnect does exactly what the startup dial does — Hello
  with cert, thinking off, mailbox flush — so the phone re-admits the session.
  One-shot verbs are not delayed; the loop dies with the session.
- A registry row holding a bare endpoint id is dialable (by id, via iroh's
  address lookup) and matches its device on reconnect.
- At most one dial per device is in flight; concurrent callers share its
  result. An explicit `disconnect` is respected until the next send.
- The inbox survives reconnects, so a long-polling `get_events` never strands
  on a replaced queue. Text drains (`get_messages`, `wait_for_reply`) discard
  presence entries; `get_events` reports them.
- Tests no longer write to the developer's real `~/.azula`.

## Capabilities

### Modified Capabilities

- `mcp-bridge`: presence maintenance and disconnect detection become
  requirements; `get_events`' `connected`/`disconnected` events become real;
  bare-id registry rows are dialable.

## Impact

- **azula-cli** 0.3.1: `src/core/{device,mod,presence,watch}.rs`,
  `src/bridge/tools.rs`, `src/cli/watch_cmd.rs`, `docs/notifications.md`.
- **Behaviour change:** a one-shot send to an offline invite-paired phone now
  waits up to the 30 s connect timeout before falling back to relay/mailbox
  (it used to fail instantly on the parse error) — the same wait full-ticket
  devices always had.
- Closes tasks 2.1 and 2.2 of `cli-send-delivery-truthfulness`.
- No wire change; the app is untouched (its own redial gap for sessions is a
  separate follow-up).
