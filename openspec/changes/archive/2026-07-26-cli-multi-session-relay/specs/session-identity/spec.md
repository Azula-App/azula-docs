# session-identity — delta

## ADDED Requirements

### Requirement: Machine Identity Key
Each azula installation SHALL hold a stable machine identity keypair persisted at `~/.azula/machine.key`, adopting an existing `~/.azula/bridge.key` unchanged on first run so prior phone pairings keep working (the endpoint id is unchanged). The machine key SHALL sign session certificates and SHALL be the identity a phone pairs with.

#### Scenario: bridge.key migrates in place
- **WHEN** azula runs on a machine that has `bridge.key` but no `machine.key`
- **THEN** the bridge key becomes the machine key and the machine's endpoint id — and thus existing pairings — are unchanged

### Requirement: Per-Session Keys and Certificates
Every azula process that talks to a device (an MCP server, a terminal host, a scripted session) SHALL use its own session keypair, never the machine key directly, and SHALL present an `azd…` certificate in `Hello.cert` binding the session key (`device_pk`) to the machine key (`root_pk`) with the session role flag set and an expiry (default 7 days). Concurrent sessions SHALL therefore never share a endpoint id.

#### Scenario: Two Claude Code windows, two conversations
- **WHEN** two MCP sessions run concurrently on one paired machine
- **THEN** each binds its own endpoint with its own certified session key and the phone shows two separate conversations

### Requirement: Session Continuity Across Invocations
A session SHALL be nameable via `--session <name>` or `AZULA_SESSION`, with its key persisted under `~/.azula/sessions/<name>.key` so successive one-shot CLI invocations land in the same conversation. Defaults SHALL be: one-shot verbs (`message`, `ui`, `file`, `watch`) use the persistent session `cli`; `azula mcp`, `azula run`, and `azula terminal` mint a fresh ephemeral session per process (key under the temp dir, removed on clean exit).

#### Scenario: Script invocations share one conversation
- **WHEN** a script calls `azula ui render` then `azula ui update` with no session flags
- **THEN** both invocations use the `cli` session key and affect the same conversation and surface

#### Scenario: Fresh MCP process is a fresh conversation
- **WHEN** `azula mcp` starts without `--session`
- **THEN** it mints a new ephemeral session key and the phone gets a new conversation

### Requirement: Phone Auto-Accepts Certified Sessions as Flat Conversations
The app SHALL admit a connecting stranger without invite or pending prompt when all of the following hold: its `Hello.cert` decodes and self-verifies (signature by `root_pk`, unexpired), carries the session role flag, its `root_pk` equals the root/endpoint key of an already-paired machine contact, and its `device_pk` equals the transport peer endpoint id. An admitted session SHALL get its own auto-created conversation (flat in the conversation list, titled from the session's `Profile` frame). A cert failing any check SHALL fall through to the ordinary invite gate.

#### Scenario: Session admitted without prompt
- **WHEN** a session presents a valid unexpired session cert chaining to a machine the phone has paired with
- **THEN** the conversation appears without any user approval step

#### Scenario: Cert for an unpaired machine falls through
- **WHEN** a session cert's `root_pk` matches no paired machine contact
- **THEN** the connection is treated as an ordinary stranger (invite required)

#### Scenario: Transport binding enforced
- **WHEN** a session cert's `device_pk` differs from the connection's transport peer id
- **THEN** the session is not admitted via the cert path

### Requirement: Headless Scan-Per-Session Pairing
A process with no machine key SHALL self-certify (session key doubling as its own root) and print a standard signed invite — the `https://azula.app/i/…` link plus a QR — then wait for approval; the user approves each such session individually from the phone. No standing credential SHALL be written in the headless environment.

#### Scenario: CI session pairs by scan
- **WHEN** `azula run` triggers a handoff on a CI runner with no machine key
- **THEN** the job log shows an invite URL and QR, and the phone can attach after the user scans or taps it

#### Scenario: No secrets at rest in the container
- **WHEN** a headless session exits
- **THEN** no credential usable by a later process remains on disk

### Requirement: Session Expiry Bounds Exposure
Session certificates SHALL expire (default 7 days, overridable per session); the app SHALL treat a conversation whose session cert has expired as ended for connection purposes (reconnects re-present a cert and are re-validated) and SHALL support bulk-archiving expired session conversations. Forgetting the machine contact SHALL invalidate all its sessions at once.

#### Scenario: Expired cert cannot reconnect
- **WHEN** a session whose certificate has expired redials the phone
- **THEN** the cert path rejects it and the connection falls through to the invite gate

#### Scenario: Machine unpaired kills its sessions
- **WHEN** the user deletes/forgets the paired machine contact on the phone
- **THEN** subsequent connections from any of that machine's sessions are no longer auto-admitted
