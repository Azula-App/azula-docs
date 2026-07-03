# The MCP↔iroh bridge

The bridge is `azula-cli`'s `AzulaBridge` (`azula-cli/src/bridge/`): an MCP
server that gives an LLM client tools to manage azula-app device sessions and
peer-bridge conversations over iroh. It is the thing an agent talks to; the
azula phone app never speaks MCP directly. `azula serve` (a different
subcommand — `serve`/`main.rs`'s `serve()`) is unrelated: that's the
canned/relay demo server, not this bridge.

On startup the bridge binds one iroh `Endpoint` (`azula/llm/0` ALPN) that
serves both directions: it accepts app/peer connections that scanned its QR
*and* dials out to every device in the registry in the background (failures
are non-fatal, logged and retried). A persisted secret key at
`~/.azula/bridge.key` (see `identity.rs`) keeps the bridge's node id — and thus
its pairing code — stable across restarts.

## Starting it

Two entrypoints share the same `setup_bridge()` core (`bridge/mod.rs`); they
differ only in transport:

| Command | Transport | Bind / invocation | Use for |
|---|---|---|---|
| `azula serve-mcp [--bind ADDR] [--device URL]... [--name NAME] [--max-turns N]` | Streamable HTTP, mounted at `/mcp` | `--bind` (env `AZULA_MCP_BIND`), default `127.0.0.1:8765` | A long-running bridge process an HTTP MCP client points at, e.g. `claude mcp add --transport http azula http://127.0.0.1:8765/mcp` |
| `azula mcp [--device URL]... [--name NAME]` (default name `"Claude"`) | stdio (JSON-RPC over stdin/stdout) | none — launched by the MCP client | `claude mcp add azula -- azula mcp`; Claude Code spawns the process itself |

`--device URL` (repeatable) adds devices for this run only (not persisted).
`--max-turns` (default 20) is the hard per-peer turn cap for `say`
conversations. Because `mcp`'s stdout is the JSON-RPC channel, all logging and
the human banner go to **stderr**; `main.rs` configures `tracing_subscriber`
accordingly regardless of subcommand.

`setup_bridge()` also: loads the device registry and pre-populates the
in-memory device map, writes the runtime state file, spawns a background task
per known device to dial it, and spawns a loop that wakes every 25s to retry
dialing any disconnected device that has mail queued (see Offline mailbox).

## Tool catalog

All 12 tools live in the `#[tool_router] impl AzulaBridge` block
(`bridge/tools.rs`):

| Tool | Params | Does | Offline behavior |
|---|---|---|---|
| `connect` | `url`, `name?` | Parses a ticket/URL (`parse_ticket`, 4 forms below), saves it to the registry, dials it. Sends a `hello` frame first so peer bridges can name this bridge. | Saves + reports "saved (could not connect now)" if the dial fails |
| `list_devices` | — | Union of registry + in-memory devices with fingerprint and status (`connected`/`disconnected`/`offline`) | n/a |
| `send_message` | `device`, `text` | Streams `text` to the device as a chat assistant reply (`thinking(true)` → `token` → `token_done` → `thinking(false)` frames) | Queued to the device's mailbox, tool returns success with "queued…(offline)" |
| `get_messages` | `device?` | Non-blocking drain of one device's inbox, or all devices' (prefixed `《name》`) if omitted. Lines are user chat text, peer `say` text, or `ui-event: {...}` JSON from an A2UI tap | n/a (reads only) |
| `wait_for_reply` | `device`, `timeout_s?` (default 120) | Long-polls (200ms interval) the device's inbox until non-empty or timeout; returns `"(no reply within Ns)"` on timeout | n/a |
| `set_name` | `description?`, `name?`, `device?` | Sends a `Profile` frame to set the conversation's displayed name (default: bridge's own name, usually left unset) and description (e.g. `"azula / terminal refactor"`); applies to one device or all connected | Silently sends to whichever devices are currently connected; not queued |
| `say` | `device`, `text`, `done?` | Peer-bridge-to-peer-bridge chat message (not for app devices). Enforces `max_turns`; closes the conversation and notifies the peer at the cap, or when `done=true` | Queued as a `Chat` frame if the peer is unreachable |
| `render_ui` | `device`, `components`, `data_model?`, `surface_id?` | Creates (or replaces) an A2UI surface: `createSurface` → `updateComponents` → optional `updateDataModel`. Validates `components` is an array with one `"id":"root"` | Requires a live connection (`ensure_device`); errors if unreachable — not queued |
| `update_ui` | `device`, `surface_id`, `path`, `value` | Sends `updateDataModel` at an RFC 6901 JSON pointer (`""` = whole model) into an existing surface | Requires live connection; not queued |
| `delete_ui` | `device`, `surface_id` | Sends `deleteSurface` | Requires live connection; not queued |
| `start_pairing` | — | Returns the bridge's own pairing URL (`https://azula.app/s/<ticket>`) + a Unicode QR block to show the user | n/a |
| `disconnect` | `device`, `forget?` | Drops the live send stream (and connected flag); `forget=true` also deletes the device from both registry files | n/a |

`send_message` and `say` are the only tools with mailbox fallback — `render_ui`/`update_ui`/`delete_ui`
require a live stream and fail outright if the device is unreachable (A2UI surface state isn't
something the app can replay from a queue). All tools lazily (re)dial a known-but-disconnected
device via `ensure_device()` before giving up.

`get_messages` and `wait_for_reply` are the two ways to receive; the tool descriptions in
`ServerHandler::get_info()`'s `instructions` string spell out the recommended loop
(`send_message`/`render_ui` → `wait_for_reply` → react with `update_ui`).

## A2UI tools

`render_ui`/`update_ui`/`delete_ui` speak the A2UI v0.9.1 wire protocol
(`createSurface`/`updateComponents`/`updateDataModel`/`deleteSurface`, wrapped
in an `a2ui` frame by `send_a2ui`). The full component/prop catalog is
reproduced verbatim in `render_ui`'s `#[tool(description = …)]` string (it must
be kept in lockstep with the app's renderer) — see
[`a2ui.md`](a2ui.md) for the design-system summary and where the renderer
lives; don't duplicate the catalog here.

## Pairing flow

1. `azula pair <url-or-token> [--name NAME] [--global]` — parses the ticket
   and writes it to the registry (project by default, `--global` for
   `~/.azula`) without dialing. Or the LLM calls **`connect`**, which does the
   same write *and* dials immediately.
2. To pair a phone *to* a running bridge: call **`start_pairing`**, show the
   user the URL + QR; they scan it (or paste the URL/code into the app's "＋
   connect a peer"). The phone dials the bridge's `azula/llm/0` ALPN.
3. `parse_ticket` (`link.rs`) accepts four input forms interchangeably:
   `https://azula.app/s/<token>`, `https://azula.app/connect/<token>`,
   `azula://connect?code=<token>`, or a bare token.
4. On accept, the bridge names the peer with priority (1) node-id match
   against a known device/registry ticket (`match_known_device` — recognizes a
   reconnecting device even if it announces a different name), (2) the
   `Hello{name}` frame it sent, (3) a generated `scan-<8hex>` fallback. Node-id
   match matters because iroh node ids are stable but a fresh `Hello` name
   isn't always trustworthy on reconnect.
5. Every accepted app connection (not peer bridges) gets a `Hello{name:
   own_name}` frame back so the phone titles the conversation (e.g. "Claude");
   refine it later with `set_name`.

## Device registry + runtime state

See [`CLAUDE.md`'s "azula device registry"](../CLAUDE.md) section for the
project/global/runtime file paths and precedence; this extends it with
bridge-internal detail:

- **Project** `<worktree-root>/.azula/devices.json` and **global**
  `~/.azula/devices.json` (`registry.rs`) store `{name, ticket, added_at}`;
  `registry::load()` merges global-then-project, project winning on name
  collision. `AZULA_REGISTRY_DIR` overrides both paths (tests use an isolated
  temp dir automatically under `cfg(test)`).
- **Runtime** `$TMPDIR/azula/bridge.json` (`state_path()` /
  `write_state()` in `bridge/state.rs`) is rewritten on every connect/disconnect/
  registry change: `{bind, pid, devices: [{name, connected}]}`. `bind` is the
  HTTP bind address for `serve-mcp`, or the literal string `"stdio"` for
  `azula mcp`. An agent can read this file to discover a bridge already
  running without calling a tool.
- `disconnect(forget=true)` removes the device from *both* registry files
  (`registry::remove`), not just the in-memory map.

## Conversation naming

`set_name` is the only tool that touches display naming, via a `Frame::Profile
{name, description}`. Convention (baked into the tool description and the
server's `instructions`): leave `name` unset so the conversation keeps the
bridge's own name (`--name`, default `"Claude"` for stdio, `bridge-<8hex>` for
HTTP-with-no-`--name`); put the session's identity in `description` (e.g.
`"azula / terminal refactor"`) — the app shows it under the name in the
conversation list and chat header. Keep the same description across a
session's tool calls; set a fresh one when a new session starts. Omitting
`device` applies it to every currently-connected device.

## Offline mailbox

`mailbox.rs` gives `send_message` and `say` store-and-forward when a device
isn't connected: frames are appended as JSONL to
`<mailbox_dir>/<sanitized-device-name>.jsonl`, one file per device, capped at
1000 frames (oldest trimmed on overflow). `mailbox_dir()` resolves, in order:
`AZULA_MAILBOX_DIR` env, else `<global-registry-parent>/mailbox` (i.e.
`~/.azula/mailbox`), else `$TMPDIR/azula/mailbox`.

Queued frames flush in `flush_mailbox()`, called right after a successful dial
— both when the bridge dials out (`connect_device`) and when a device dials
*in* (`accept_incoming`) — before the send stream is handed to the tool layer,
so a phone that reconnects gets its backlog first. The flush only clears the
file if every frame writes successfully; a failure leaves it intact for the
next attempt. Separately, the 25-second background loop in `setup_bridge()`
scans for `!connected` devices with `mailbox::has_pending() == true` and
retries `connect_device` for each.

## Peer bridge conversations (`say`)

Two bridges dial each other with `connect`, exchanging a `Hello{name}` frame
first (unlike app connections, peer bridges never get a naming reply). `say`
then carries chat text peer-to-peer; the recipient bridge surfaces it through
its own `get_messages`. Each `DeviceConn` tracks a per-peer `turns` counter and
`closed` flag: `say` enforces the bridge's `--max-turns` cap, sending a
`"[conversation ended: turn limit]"` notice and closing when hit, or closing
immediately (with a `"[conversation ended by <name>]"` notice) when the caller
passes `done: true`. A closed conversation rejects further `say` calls until
the device reconnects (`connect`/`connect_device` calls `reset_conversation()`).

## Superseded coverage

This page is now canonical for the bridge. It supersedes:
- `azula-site/URLS.md`'s "Device registry" and Flow B tool list (5 of 12 tools,
  and predates `wait_for_reply`/`set_name`/`render_ui`/`update_ui`/`delete_ui`/
  `start_pairing`/`say`) — that page should now just link here for bridge
  detail and keep only the URL-routing content that's actually its job.
- `a2ui.md`'s incidental mentions of `render_ui`/`update_ui`/`delete_ui` as
  tools (it remains canonical for the *component catalog* and design tokens;
  this page owns the tool contracts and sync/offline semantics).
