# Drive an OpenClaw bot from azula

## Why

[OpenClaw](https://docs.openclaw.ai) is a self-hosted gateway that fronts an AI
agent behind ordinary chat apps — WhatsApp, Telegram, Signal, Discord, iMessage
— via **channel plugins**. Sal runs one. Today the only way to reach it from a
phone is through one of those third-party messengers, which means routing a
personal agent's traffic (and whatever it is asked to do) through someone
else's servers.

azula is already the missing channel: an end-to-end iroh transport between a
phone and a machine, with a chat surface, file transfer, and A2UI — an
interactive-widget protocol no messenger channel has. What it lacks is the
adapter that makes OpenClaw see it as a channel. `azula mcp` already exposes
exactly the verbs a channel needs (`send_message`, `send_file`, `render_ui`,
`get_messages`, `wait_for_reply`, `set_name`), so the adapter is a translation
layer, not new transport work.

## What Changes

- **New sibling repo `azula-openclaw/`** — an OpenClaw channel plugin published
  as the npm package `@azula-app/openclaw`, installable with
  `openclaw plugins install @azula-app/openclaw`. It registers channel id
  `azula`, so azula appears alongside the built-in channels in
  `openclaw channels add`, routing, and access groups.
- **The plugin owns one long-lived `azula mcp` stdio session** named `OpenClaw`
  (`--session openclaw --name OpenClaw`), speaking MCP JSON-RPC over its
  stdin/stdout. All traffic in both directions goes through that one session,
  so the phone shows exactly one conversation titled after the bot — not one
  per direction.
- **Outbound (OpenClaw → phone):** `outbound.sendText` maps to `send_message`;
  attachments map to `send_file`; agent questions and approvals that declare
  structured choices render as real A2UI surfaces via `render_ui`/`update_ui`
  instead of a wall of text.
- **Inbound (phone → OpenClaw):** a pump long-polls the bridge for structured
  events, converts each into an OpenClaw inbound envelope (sender, conversation
  route, text, media facts, A2UI tap payloads), and dispatches it through the
  channel's ingress so the agent replies as it would to a WhatsApp message.
- **Typing indicators:** `heartbeat.sendTyping` drives the app's existing
  "thinking" state, so a long agent turn looks alive on the phone.
- **Two new MCP bridge tools in `azula-cli`,** because the channel contract
  cannot be met without them:
  - `set_typing` — emit a bare `thinking(true|false)` frame. Today `thinking`
    is only ever emitted *inside* `send_message`'s streaming sequence, so there
    is no way to show activity before any text exists.
  - `get_events` — a structured inbound drain mirroring `azula watch --json`'s
    event shape (`message` / `ui_event` / `file` / `connected` /
    `disconnected`, each with its source `device`), in both an immediate and a
    long-polling mode. `get_messages` flattens every event into one
    human-readable line, which loses the media facts and tap payloads a channel
    plugin must forward, and makes a user who literally types `ui-event: {…}`
    indistinguishable from a real tap; `wait_for_reply` is the only existing
    long-poll but it *drains* the inbox as text, so it cannot be used as a wake
    signal ahead of a structured read.
- **DM security and pairing** reuse azula's own model: a device already paired
  with the machine is the allowlist. The plugin exposes `start_pairing`'s
  invite URL and QR through OpenClaw's pairing text hooks rather than inventing
  a second pairing code.
- **No `azula-app` changes.** The phone already renders chat, files, and A2UI
  from any bridge session; OpenClaw arrives as a normal conversation named by
  `set_name`.

Not in scope: terminal handoff from the chat (`azula run`/`azula terminal`),
group/multi-user routing, and OpenClaw-side tool registration — this change
makes azula a *channel*, not an agent surface.

## Capabilities

### New Capabilities

- `openclaw-channel`: the `@azula-app/openclaw` channel plugin — its channel
  identity and config schema, the single-MCP-session lifecycle, the outbound
  text/media/A2UI mapping, the inbound event→envelope translation, typing,
  pairing and DM policy, and failure/reconnect behavior.

### Modified Capabilities

- `mcp-bridge`: adds the `set_typing` and `get_events` tools to the bridge tool
  catalog, and states that structured inbound consumers use `get_events` while
  `get_messages` stays the human/LLM-readable drain.

## Impact

- **New repo:** `azula-openclaw/` — TypeScript, Node 22.22.3+ (OpenClaw's
  floor), depending on `openclaw/plugin-sdk` subpath imports and an MCP client
  library. Package layout follows OpenClaw's convention: `package.json`
  (`openclaw.channel` metadata), `openclaw.plugin.json`, `index.ts`
  (`defineChannelPluginEntry`), `setup-entry.ts`, `src/`.
- **`azula-cli`:** `src/bridge/tools.rs` gains two tools; the inbox
  representation behind `get_messages` gains a structured accessor. No wire
  protocol change — `thinking` and every inbound frame already exist.
- **`azula-docs`:** new `specs/openclaw-channel/`, delta on `specs/mcp-bridge/`,
  and a project-map entry for the sixth repo.
- **Runtime dependency:** the plugin requires the `azula` binary on the
  gateway's PATH and a machine identity paired with the phone. It degrades to a
  clear configuration error, not a crash loop, when either is missing.
- **No `azula-app` code, no release-notes entry** — nothing user-observable
  changes in the shipped app.
