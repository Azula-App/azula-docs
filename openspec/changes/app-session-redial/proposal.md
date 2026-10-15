# Let the app redial a session conversation

## Why

On 2026-10-12, OpenClaw on houston showed that a conversation with a CLI
session (`azula mcp --session <name>`) went offline every time that process
restarted or its connection dropped, and the app never brought it back.
`ConversationState.online` is true only while a stream is wired, and
`ConnectService.scheduleReconnect` returned at once for a conversation with no
`sourceTicket` — which is every session conversation, because the session
dialed the phone, not the other way round. No trigger reached one: not the
stream drop, opening the conversation, a transport re-bind, or the app
returning to the foreground.

`cli-device-presence` (azula-cli 0.3.1) made the session keep redialing its
devices, but that dial can only land while the app is reachable, and a
backgrounded Android app's endpoint often isn't. Its proposal names the app's
own gap as a separate follow-up; this is that follow-up.

## What Changes

- A session conversation is keyed by the session's `device_pk`, which is its
  iroh endpoint id, so the app can dial it with no ticket. The transport gains
  `IrohTransport.connectById`, which wraps iroh-kmp 0.2.0's existing
  `IrohEndpoint.connectById` (the app's endpoint already binds with address
  lookup on, and session endpoints publish through the n0 preset). No SDK bump.
- `scheduleReconnect` redials a session conversation by id on the ALPN it was
  admitted on, with the same 8-attempt backoff a ticketed conversation gets.
  That covers a stream drop and opening the conversation.
- A new `reconnectSessions` fans out over every offline session conversation
  on each transport (re)bind and on the foreground false→true edge, with
  2 attempts each. An ephemeral `azula mcp` deletes its key on exit, so many
  unexpired session conversations belong to sessions that are gone for good,
  and the full budget on every resume would waste dials on them.
- Every app-initiated redial re-validates the certificate in the session's
  answering `Hello` with `checkSessionCert`, the same five checks an inbound
  reconnect gets. A refusal closes the stream and ends the loop. A pass
  refreshes `sessionExpiresAt`, since a restarted named session mints a fresh
  cert.
- Disabled conversations and those whose stored expiry has passed are never
  redialed.
- Terminal sessions are excluded: a terminal host answers no `Hello`, so there
  would be nothing to re-validate. Their hosts redial on their own.

## Capabilities

### Modified Capabilities

- `session-identity`: adds "The App Redials a Session Conversation".

## Impact

- **azula-app**: `network-api` (`IrohTransport.connectById`), `network-real`
  (the JVM/Android and iOS transports), `shared` (`ConnectService`,
  `AzulaState.setForeground`), and tests in `mock-support`.
- When this landed, iOS never called `AzulaState.setForeground`, so the
  foreground trigger was Android-only. `resume-sync-ios-desktop` (tasks 2.1/2.2)
  has since wired iOS's `scenePhase` into it through `ForegroundBus`, so iOS
  redials on resume too. Desktop still has no foreground signal.
- No wire change; azula-cli is untouched.
