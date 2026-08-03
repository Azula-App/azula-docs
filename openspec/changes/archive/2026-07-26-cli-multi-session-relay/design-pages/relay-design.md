# The relay — mailbox generalized, three traffic classes

`azula relay` (alias: `azula mailbox`) is the identity's always-on sibling
device: the same store-and-forward/bootstrap role
[`account-sync/design.md`](../../../specs/account-sync/design.md)'s "mailbox role"
section already documents, now additionally carrying **agent chat** (a
session ↔ phone conversation, when they can't reach each other directly) and
**A2UI surface snapshots** (kept deliberately outside the hash-chained
identity log). This page documents what's new; the sync/bootstrap mechanics
underneath are unchanged and stay documented in `account-sync/design.md`.

## Where it lives

- `azula-cli/src/mailbox_role.rs` — module and internal names (`log_store_dir`,
  `CHAT_ALPN`, `ChatHandler`) are kept as-is (task 4.1: "limit churn") — only
  user-facing strings (the CLI command, banner, log lines) say "relay". Adds
  `run_llm_session`/`RelayLlmHandler` (the LLM-ALPN admission + agent-chat +
  A2UI-snapshot path) alongside the pre-existing `run_chat_session`/`ChatHandler`.
- `azula-cli/src/eventlog.rs` — `Kind::AgentIn`/`AgentOut` (`0x09`/`0x0A`),
  `AgentInBody`/`AgentOutBody`.
- `azula-cli/src/core/relay_a2ui.rs` — `RelayA2uiStore`, the bounded A2UI
  side store.
- `azula-cli/src/core/mod.rs` — the session-side delivery chain
  (`send_message`/`say`'s `try_deliver_via_relay`, `ensure_relay`) and A2UI
  coalescing (`render_ui_outcome`/`update_ui_outcome`/`delete_ui_outcome`,
  `send_snapshot_to_relay`).
- `azula-cli/src/registry.rs` — relay-hint persistence (`relay_for`/`set_relay`).
- `azula-cli/src/sync.rs` — `PreSyncAckHook`, the relay's snapshot-replay hook
  point in the sync protocol.
- `azula-cli/src/proto.rs` — `Frame::RelayHint`, `Frame::A2uiSnapshot`,
  `Frame::SyncA2ui`.
- Kotlin (azula-app): `network-api/src/dev/azula/net/Protocol.kt`
  (`Frame.RelayHint`, `Frame.SyncA2ui`), `shared/src/dev/azula/state/
  ConnectService.kt` (`sendRelayHintIfKnown`, `onSyncA2ui`),
  `sync-real/src/dev/azula/sync/SyncSession.kt` (`recvLoop`'s `SyncA2ui`
  interception), `shared/src/dev/azula/state/AccountSyncService.kt`
  (`notifyNewlyAcceptedAgentMessages`), `sync-api/src/dev/azula/sync/
  {EventBodies,AccountSyncFold}.kt` (agent kind bodies + fold).

## Relay subsumes the mailbox role

`azula relay` and `azula mailbox` are now the same command
(`cli/relay_cmd.rs`'s `cmd_relay` and `cli/legacy.rs`'s `cmd_mailbox` both
call `mailbox_role::run(allow_legacy)` — no behavioral difference, and
neither is "canonical" internally). The wire-level role bit is unchanged
(`FLAG_MAILBOX = 0x01` — no new flag was minted for "relay"; a relay device
is, on the wire, exactly the mailbox-role device the app has always known
about). `mailbox_role::run` loads the identity `azula link` persisted, binds
that device's endpoint key, and serves four ALPNs:

| ALPN | Handler | Role |
|---|---|---|
| `azula/chat/0` | `ChatHandler` | peer chat store-and-forward (unchanged — see `account-sync/design.md`) |
| `azula/llm/0` (`mcp::LLM_ALPN`) | `RelayLlmHandler` | **new**: agent chat + A2UI snapshots |
| `azula/sync/0` | `SyncHandler` (with a `PreSyncAckHook`) | identity log sync/bootstrap, now also the A2UI snapshot replay point |
| `azula/link/0` | `RootlessLinkHandler` | unchanged — a relay holds no root secret and can never grant a link itself |

**Enrollment:** `cli::legacy::LinkArgs` defines `#[arg(long, alias =
"mailbox")] relay: bool` — `azula link --relay` is the primary spelling
(`--mailbox` a clap alias for the same field), matching the relay spec's
"Relay Subsumes the Mailbox Role" requirement exactly, and mirroring the
top-level `azula relay`/`azula mailbox` split. Neither flag touches the wire
role bit (`FLAG_MAILBOX`), which is unchanged either way.

## Agent chat: sessions ↔ phone via the relay's log

When a session (an `azula mcp`/`run`/`terminal` process) can't reach the
phone directly, it dials the identity's relay on the **LLM ALPN** — the same
ALPN a session already uses to reach the phone directly — and the relay
folds what it receives into its own identity log as `agent_in` entries. The
phone later learns about them by ordinary sync, live-pushed if a sync
connection to the relay happens to be open already, or on its next catch-up
otherwise.

### Admission on the relay's LLM ALPN (`run_llm_session`)

Unlike the chat ALPN (which falls through to the ordinary invite path on a
cert miss), the LLM ALPN's relay-side admission has **no invite fallback at
all** — relay spec: "Uncertified stranger refused by the relay." A
connecting session must, within 15 s (`LLM_HELLO_TIMEOUT`), present a
`Hello{cert}` whose cert:

1. decodes as a `DeviceCert`;
2. passes `certs::verify_session_cert(cert, remote_endpoint_id)` — signature,
   unexpired, `FLAG_SESSION` set, `device_pk == remote_endpoint_id` (see
   [`session-identity-design.md`](session-identity-design.md));
3. has a `root_pk` already present in the relay's **live known-roots set**.

That known-roots set is the *same* `Arc<AsyncMutex<Vec<PublicKey>>>`
`ChatHandler`'s `gate_peer` call maintains — `ChatHandler::known_roots_handle()`
hands the shared handle to `RelayLlmHandler::new` in `mailbox_role::run`
(task 4.3: "derive [the LLM ALPN's admission gate] from the same fold/contact
source the chat gate uses") — so a machine root pinned as a contact via
ordinary peer chat is recognized on the LLM ALPN too, and vice versa. Any
check failing closes the connection outright; nothing is logged, nothing is
admitted.

On success, `conversation` for everything this session sends is its own
public key hex (`cert.device_pk`, which by construction already equals
`remote_endpoint_id`) — never the machine's root key. Two frame types are
handled, everything else ignored (this ALPN carries agent chat and A2UI
snapshots only):

- **`Frame::Chat{text, id}`** → appended as a `Kind::AgentIn` log entry via
  `store.append_own(device_secret, Kind::AgentIn, body_json)`, body
  `{conversation, text, id?, from_name?}` (`from_name` taken from the
  session's `Hello.name`, omitted when blank).
- **`Frame::A2uiSnapshot{surface, components, data_model, lamport, ..}`** →
  written into `RelayA2uiStore` (below); its own `conversation` field is
  deliberately ignored — the already-authenticated cert's `device_pk` is the
  only trustworthy source for that key, never a client-declared one.

### Session-side delivery chain

`SessionCore::send_message`/`say` (`core/mod.rs`) try, in order: **direct**
(a live connection to the device, lazily redialed via `ensure_device`);
**relay**, only if a relay hint is known for the target device
(`try_deliver_via_relay`); **local JSONL mailbox**
(`mailbox::enqueue`), the pre-existing per-device fallback, only when
neither of the first two worked.

```rust
async fn try_deliver_via_relay(&self, device_name: &str, text: &str) -> Option<Result<SendOutcome, CoreError>> {
    let ticket = registry::relay_for(device_name)?;      // None -> caller falls to local mailbox
    let conn = self.ensure_relay(&ticket).await.ok()?;    // relay unreachable -> same fallback
    // ... write_frame(send, &Frame::Chat { text, id: Some(uuid) })
}
```

`ensure_relay` dials/caches the relay connection in `SessionCore`'s own
**`relay_conns` map — never `devices`** — so contacting the relay never
marks the phone device itself as "connected" in `list_devices`/`azula
status`. `send_message` reports `SendOutcome::Queued` for both the
relay-delivered and local-mailbox-fallback cases identically — a caller
(CLI or MCP tool) cannot distinguish "delivered to the relay" from "written
to the local JSONL queue" from the return value alone; both mean "not
delivered live, but handled."

### Relay hint: how a session learns the relay's ticket

The **phone**, not the session, is the source of truth for which relay
ticket to use. `ConnectService.sendRelayHintIfKnown` (Kotlin) sends
`Frame.RelayHint(ticket)` on a device's stream in two situations, both
gated on the phone already knowing a mailbox-role sibling's own connect
ticket (`SettingsService.siblingTickets`, keyed by device-pk-hex) — absence
means nothing is sent, and delivery degrades to local-mailbox-fallback,
exactly as before this change:

1. **Right after an invite/pairing is accepted** (`InviteService.onAccept`,
   right after any shared `Frame.Profile`) — this is the machine-pairing
   path the invitations spec's "Machine Pairing Shares a Relay Hint"
   requirement describes.
2. **Right after a session cert is admitted over the LLM ALPN**
   (`admitSessionCert`, per-session — since a fresh ephemeral session gets
   its own connection and thus needs its own hint delivery).

On the Rust side, `core::device::read_frames_into`'s reader loop intercepts
`Frame::RelayHint{ticket}` and calls `registry::set_relay(device_name,
&ticket)` directly — it is **never surfaced as an inbox line** (unlike chat
text or `ui-event:`), so `get_messages`/`watch` never see it.

`registry::set_relay`/`relay_for` persist the hint in a **companion file**,
`relay-hints.json` (or `global-relay-hints.json` for the global registry),
sitting next to `devices.json` rather than as a new field on the `Device`
struct — a project/global-scoped `BTreeMap<device_name, ticket>` with the
same merge precedence `devices.json` itself uses (project wins over global
on collision). This is a deliberate implementation choice documented in the
source: several call sites outside this phase's file ownership (`term.rs`,
`accept_gate.rs`, `cli/legacy.rs`) construct `Device{..}` struct literals
exhaustively, and adding a field to that struct would have required touching
every one of them. See
[`project.md`](../../../project.md#azula-device-registry-mcp-bridge-state)
for the full file-layout table — this is *not* the "`devices.json` gains an
optional relay field" shape one might expect from the proposal's prose; it's
a sibling file instead, functionally equivalent (per-device, same registry
directories, same precedence) but structurally distinct.

### Phone-side: agent kinds fold into a flat, notified conversation

Kotlin's `EventKind` enum (`core/src/dev/azula/core/EventLog.kt`) adds
`AGENT_IN(0x09)`/`AGENT_OUT(0x0A)` alongside the eight pre-existing kinds,
matching the Rust `Kind` byte values exactly. Bodies
(`sync-api/EventBodies.kt`):

```kotlin
@Serializable
data class AgentInBody(
    val conversation: String, val text: String,
    val id: String? = null, @SerialName("from_name") val fromName: String? = null,
)
@Serializable
data class AgentOutBody(val conversation: String, val text: String, val id: String? = null)
```

`AccountSyncFold.kt` folds both into `conversations: LinkedHashMap<String,
List<FoldedMessage>>` keyed by `body.conversation` (the session's public key
hex, never a contact root/endpoint id) — a `FoldedMessage` gained a `fromAgent:
Boolean = false` field, `true` for both agent kinds, letting
`rebuildProjection` and other consumers tell a session conversation's
history apart from an ordinary peer conversation's. `AGENT_IN` shares its
`(conversation, id)` dedup set (`seenIncoming`) with `MESSAGE_IN` —
deliberately: a session that delivers directly (folded as `MESSAGE_IN` on
the phone's own log the instant it's received) and, after a timeout, retries
the *same id* via the relay (folded as `AGENT_IN` on the relay's log,
synced to the phone later) must still fold to exactly one message. `AGENT_OUT`
has no dedup, matching `MESSAGE_OUT`'s existing posture.

**Auto-creating the conversation.** `rebuildProjection` now auto-creates a
conversation (LLM kind, hex-fallback name) for any folded history containing
at least one `fromAgent == true` message that `ConversationStore` doesn't
already know about — this is what makes a relayed `agent_in` for a session
this phone *never connected to directly* surface as a new conversation
rather than being silently dropped.

**Notification.** Not part of the fold itself — a delta computation layered
on top in `AccountSyncService.notifyNewlyAcceptedAgentMessages`, run once per
sync session immediately after `runSyncSession` returns, comparing the
per-device sync vector **before and after** that one sync round:

```kotlin
for ((deviceHex, afterSeq) in afterVector) {
    val beforeSeq = beforeVector[deviceHex] ?: 0L
    if (afterSeq <= beforeSeq) continue
    for (entry in store.readFrom(devicePk, beforeSeq)) {
        if (entry.knownKind != EventKind.AGENT_IN) continue
        onNewAgentMessage(decodeAgentInBody(entry.body).conversation, ...text)
    }
}
```

Firing on the vector *delta* (never "every `agent_in` currently in the
fold") is what keeps a rebuild/bootstrap replay from re-notifying for
messages already seen in an earlier session. `onNewAgentMessage` is wired to
`FrameDispatcher.notify` — the app's ordinary new-message notification path,
same as any other conversation (account-sync spec: "a device receiving a
relayed `agent_in` for a new conversation SHALL surface it with its normal
new-message notification path").

**Reconnect re-validation.** `ConversationState.sessionExpiresAt` (set by
`admitSessionCert` on first admission, `Long.MAX_VALUE` sentinel for
`expires_at == 0`/"never") both records the cert's expiry *and* forces
`ConnectService` to re-run the full five-check gate on every reconnect for
that conversation, rather than trivially treating an already-known
conversation id as authorized — an expired cert redialing is rejected and
falls through to the invite gate exactly as a first-time presentation would.
`AzulaState.archiveExpiredSessions()` bulk-disables any conversation whose
`sessionExpiresAt` has passed, per the session-identity spec's "Session
Expiry Bounds Exposure" requirement.

## A2UI snapshots: a bounded side store, outside the log

A2UI surface state is **never** written to the hash-chained identity log —
account-sync spec: "A2UI surface state SHALL NOT be written to the log in
any kind." The rationale (from the change's design.md, restated here because
it drives `RelayA2uiStore`'s entire shape): a blackjack-style game issuing
one `update_ui` per card flip would, if logged, append a full surface copy
forever, replicated to every device in the identity on every sync — an
unbounded, ever-growing cost for state that only ever needs its *latest*
value.

### `RelayA2uiStore` (`core/relay_a2ui.rs`)

Latest snapshot per `(conversation, surface_id)`, capped at 256 KiB
(`MAX_SNAPSHOT_BYTES`) measured as serialized `components` + `data_model`
combined, persisted as one JSON file per surface:
`<dir>/<root_pk_hex>/<sanitized_conversation>__<sanitized_surface>.json`.
`components: null` on disk is the tombstone (a deleted surface). Which
devices have already received a given snapshot's `lamport` — the `delivered`
map — is **intentionally in-memory only, never persisted**: a relay restart
just means every still-pending surface replays once more to every device on
its next sync, which is safe because every wire message it replays
(`createSurface`/`updateComponents`/`deleteSurface`) is an overwrite/set
operation on the phone, never an append.

```rust
pub async fn put(&self, conversation: &str, surface: &str,
    components: Option<Value>, data_model: Option<Value>, lamport: u64)
    -> Result<(), TooLarge>;   // rejects (store unchanged) over the 256 KiB cap

pub async fn drain_pending_messages_for_device(&self, device_pk_hex: &str)
    -> HashMap<String, Vec<Value>>;   // grouped by conversation; marks delivered
```

`put` always **overwrites** whatever was stored for that
`(conversation, surface)` — ten `update_ui` calls against one surface while
the phone is offline coalesce to one stored snapshot (the latest), never ten.
`drain_pending_messages_for_device` compares each stored snapshot's
`lamport` against what that device was last marked as having received;
anything newer (or never delivered) is converted to wire messages
(`to_wire_messages`) and the device's delivered-lamport is bumped —
optimistically, before the caller has confirmed the write actually reached
the wire, which is an accepted trade-off for this bounded, idempotent-replay
side store (worst case: one extra replay next time, never data loss).

### Session-side coalescing

A session that renders a surface **live** also **retains a copy** of it
(`SessionCore::surface_state: HashMap<(device_name, surface_id),
SurfaceState>`) purely so a *later* `update_ui` in the same session can still
build a valid full-surface snapshot if the device goes offline mid-session —
`update_ui`'s offline path can only coalesce when this session already holds
the surface's full state:

```text
render_ui:  device reachable -> live createSurface/updateComponents/[updateDataModel]
            device unreachable + relay known -> retain state, send Frame::A2uiSnapshot (full)
            device unreachable + no relay -> the original CoreError (unchanged pre-relay behavior)

update_ui:  device reachable -> live updateDataModel; ALSO refresh the retained cache
                                 (so a later offline update in the same session can still coalesce)
            device unreachable + relay known + this session holds the surface
                              -> apply the pointer locally, send the resulting full snapshot
            device unreachable + relay known + NO retained state
                              -> the original unreachable error (can't build a valid
                                 snapshot from a bare pointer delta alone)
            device unreachable + no relay -> the original error

delete_ui:  device reachable -> live deleteSurface
            device unreachable + relay known -> tombstone snapshot (needs no retained
                                 state — a delete carries no components either way)
            device unreachable + no relay -> the original error
```

This is exactly the mcp-bridge spec's "`update_ui` against an offline phone
therefore works iff the session holds the full surface (it does — it
rendered it)" scenario. `send_snapshot_to_relay` enforces the 256 KiB cap
**client-side, before ever writing to the wire** — an oversized snapshot
becomes a `CoreError::Usage` the caller sees immediately, never a silent
truncation or a wire round-trip that the relay then rejects. Each snapshot
carries a per-process monotonic `lamport`
(`A2UI_SNAPSHOT_LAMPORT`, unrelated to the account-sync log's own lamport
concept) so the relay can ignore a stale, out-of-order snapshot for a
surface — this only orders one session's snapshots against one relay, it is
not a cross-device clock.

### Replay to the phone: the `PreSyncAckHook`

The relay's sync handler (`SyncHandler::with_pre_ack_hook`) opts into a
narrow extension point in `sync.rs`'s otherwise-unmodified session runner:

```rust
pub type PreSyncAckHook = Arc<
    dyn Fn(PublicKey) -> Pin<Box<dyn Future<Output = Vec<Frame>> + Send>> + Send + Sync,
>;
```

`send_loop` calls this hook — passing the peer's verified cert's `device_pk`
— **after** streaming the peer's catch-up gap (`SyncEntries`) but **strictly
before** writing this side's own `SyncAck`. The relay's hook
(`mailbox_role::run`) drains `RelayA2uiStore::drain_pending_messages_for_device`
for that device and emits one `Frame::SyncA2ui { conversation, messages }`
per conversation with pending state.

**Why before the ack, not after** (an earlier draft of this hook had it the
other way — the source comment on `sync.rs`'s `PreSyncAckHook` documents the
reversal explicitly): the phone's sync receive loop has a *bounded catch-up*
mode (`untilAck` in Kotlin's `recvLoop`) that stops listening for frames the
instant its own `SyncAck` arrives — a frame sent after the ack in that mode
would simply never be read. Sending the replay after the gap but before the
ack is honored in **both** the phone's bounded catch-up mode and ordinary
live-push mode, since neither has returned/stopped listening yet at that
point in the exchange. This is the answer to "document WHY" the ordering
matters: it is not an arbitrary protocol-sequencing choice, it is required
by an asymmetry in how the two sides' receive loops are implemented.

On the Kotlin side, `SyncSession.kt`'s `recvLoop` intercepts
`Frame.SyncA2ui` **before** it would otherwise fall through to the generic
frame-store-insert path — it's handed straight to the `onSyncA2ui` callback,
never touching `EventLogStore` at all (reinforcing "A2UI state is never
written to the log," now from the receive side too). `ConnectService.onSyncA2ui`
ensures the conversation exists (`ensureConv`, LLM kind, keyed by the
session pk hex — same auto-create-if-unknown posture as the agent-chat fold)
and replays each message through `FrameDispatcher.applyFrame`'s existing
`Frame.A2ui` branch, unmodified — so a replayed `createSurface` +
`updateComponents` + `updateDataModel` sequence and a live one are handled
by literally the same code path, and applying a full sequence for an
already-live surface is safe (the `CreateSurface` branch *replaces* the
surface outright, never merges).

## What's still direct-only

**Terminal traffic is never relayed** — relay spec: "Interactive terminal
traffic Is Never Relayed." Nothing in `term.rs`'s persistent-session
machinery or `cli::run_cmd`/`cli::terminal_cmd`'s handoff path touches the
relay at all; a terminal session with the phone unreachable simply waits for
a direct connection (see [`terminal/design.md`](../../../specs/terminal/design.md)).
**`send_file` also never queues** through the relay or anywhere else — see
`mcp-bridge/design.md`'s "Live-Connection-Only Tools" — a large file isn't
something the relay's 256 KiB-per-surface A2UI cap or the local mailbox's
1000-frame cap can reasonably hold.

**Reverse direction (phone → dead session)** is a documented limitation, not
a bug: a reply to a session that no longer exists (its process exited,
`SessionKey`'s ephemeral guard already deleted its key) delivers nowhere —
it remains in the phone's conversation history, and `azula watch`/a running
session only ever receives live replies, never resurrected ones.

## Open items

- `cli::run_cmd`/`cli::terminal_cmd` both carry a `TODO(phase 4)` comment for
  pushing a relayed "build failed — attach here" / "session online" agent
  message through `SessionCore::send_message` when a machine identity exists
  — **still present as a TODO** in both files as of this writing; the relay
  delivery chain this needs now exists (this page documents it), but the
  call sites in `run_cmd.rs`/`terminal_cmd.rs` haven't been wired up to use
  it yet. Every handoff/hosted-session path today always falls back to
  printing the connect block (invite URL + QR), even on a machine with a
  known relay. See [`terminal/design.md`](../../../specs/terminal/design.md#open-items).

## Tests

- `mailbox_role.rs` — `run_chat_session`/`run_llm_session` in-memory-duplex
  tests: known-certified-root append, admission checks (missing cert, bad
  signature, expired, wrong `FLAG_SESSION`, unknown root, transport-binding
  mismatch), `agent_in` append shape.
- `eventlog.rs` — the four-entry cross-language vector (`message_out` ×2,
  `read_marker`, `agent_in`), `agent_body_field_order_and_optional_omission`.
- `core/relay_a2ui.rs` — coalescing to one snapshot, tombstone replay,
  oversized rejection, no-double-replay-to-the-same-device, replay-again on
  a genuinely new lamport, on-disk persistence across a reopen.
- `sync.rs` — `PreSyncAckHook` ordering (hook output arrives before `SyncAck`
  in the frame stream both in bounded and live-push runs).
- Kotlin: `mock-support/test@jvm/SessionCertGateTest.kt` (relay-hint send/
  no-send on session admission), `core/test/CrossLanguageVectorTest.kt`
  (`agentInEntryChainedAfterTheThreeEntryVectorDecodesAndReEncodesByteIdentical`).
- Run: `cargo test` from `azula-cli/` (`mailbox_role`, `eventlog`,
  `core::relay_a2ui`, `sync` modules); `./check -m sync-api -m core -m
  shared` from `azula-app/`.
