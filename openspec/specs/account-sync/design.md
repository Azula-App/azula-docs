# Account Sync — the per-device event log, sync protocol, and mailbox role

Account sync is what makes "one identity, several devices" actually converge:
every enrolled device (see [`device-linking.md`](../device-linking/design.md))
owns exactly one append-only, hash-chained log of signed entries. There is no
merge logic anywhere in this design — a device is the single writer of its
own log, so its log never forks — and the identity's entire visible state
(conversations, contacts, device set, read state, profile) is a deterministic
fold over the union of every device's log. A device with the **mailbox**
role is nothing more than a sibling that promises to always be reachable and
to keep its logs around, which is what turns "my phone was off" into
store-and-forward instead of a lost message.

## Log entry layout

Binary, all integers **big-endian**:

| offset | size | field | notes |
|---|---|---|---|
| 0 | 1 | `version` | `0x01` |
| 1 | 1 | `kind` | see "Event kinds" below; unrecognized bytes are preserved, not rejected |
| 2 | 32 | `device_pk` | the author device's public key |
| 34 | 8 | `seq` | u64, per-device; first entry is `1`, strictly `+1` thereafter |
| 42 | 8 | `lamport` | u64; one greater than the highest lamport this device has seen anywhere at append time |
| 50 | 8 | `ts_ms` | u64 unix milliseconds; display only, **never** used for ordering |
| 58 | 32 | `prev_hash` | SHA-256 of the previous entry's full wire bytes; all zeros at `seq == 1` |
| 90 | 4 | `body_len` | u32 (`n`) |
| 94 | n | `body` | UTF-8 JSON, kind-specific |
| 94+n | 64 | `signature` | Ed25519 by the *device* key over bytes `[0, 94+n)` |

A payload shorter or longer than exactly `94 + body_len + 64` bytes is
rejected outright. Unlike the `azd`/`azr`/`azl` payloads, an entry has no
`"az…"` string form — it never leaves the sync protocol as a standalone
shareable token, so there is no base32 encoding step for it (see "Base64, not
base32" below).

## Event kinds

| byte | kind | body |
|---|---|---|
| `0x01` | `message_out` | `{conversation, text, id?}` |
| `0x02` | `message_in` | `{conversation, from_device_pk, text, id?}` |
| `0x03` | `read_marker` | `{conversation, up_to_lamport}` |
| `0x04` | `contact_add` | `{root_pk \| node_id, name?}` |
| `0x05` | `contact_remove` | same body shape as `contact_add` |
| `0x06` | `device_add` | `{cert}` — an `"azd…"`-encoded certificate |
| `0x07` | `device_revoke` | `{revocation}` — an `"azr…"`-encoded revocation |
| `0x08` | `profile_update` | `{name?, description?}` |
| `0x09` | `agent_in` | `{conversation, text, id?, from_name?}` — cli-multi-session-relay: agent chat the identity's relay logged on a session's behalf, see below |
| `0x0A` | `agent_out` | `{conversation, text, id?}` — the identity's reply to an agent conversation, keyed the same way |

`conversation` is the contact's root public key in hex for a certified
contact, or its node id in hex for a legacy one, for every kind **except**
`agent_in`/`agent_out` — for those two, `conversation` is the **session's own
public key in hex** (`certs::FLAG_SESSION`'s `device_pk`; see
[`session-identity/design.md`](../../changes/cli-multi-session-relay/design-pages/session-identity-design.md)),
never a contact root or node id, since a session isn't a contact of the
identity at all — it's an ephemeral peer the relay admitted by a
machine-chained cert. This is the same string already used as the
peer-conversation key elsewhere in the app for the peer kinds, so root-pk
keying (task 7.3, not yet wired — see "Implementation status") is a
substitution of that one value for those kinds, not a shape change here; the
agent kinds were never subject to that pending substitution since they never
used a contact key to begin with. Every JSON body field name is snake_case
(`up_to_lamport`, `from_device_pk`, `from_name`, ...) to match what
`azula-cli`'s `eventlog.rs` produces on the wire — Kotlin's serializers pin
`@SerialName` accordingly rather than relying on a naming-convention
transform, so the exact field names appear literally in the recorded test
vector below.

### Agent chat fold rules (cli-multi-session-relay)

`agent_in`/`agent_out` fold into `conversations` exactly like `message_in`/
`message_out` — same total order, same map keyed by `conversation` — with
two differences the fold marks explicitly:

- **A shared dedup space.** `agent_in` shares its `(conversation, id)` dedup
  set with `message_in` (Kotlin: one `seenIncoming` set covers both kinds,
  rather than each kind tracking its own). Per the account-sync spec's
  "Agent retry deduplicates" scenario — a session that retries the same
  message `id` (e.g. after a delivery it assumed failed, or across a
  direct-then-relay fallback) must still fold to exactly one message,
  regardless of which kind byte ends up carrying which attempt into the log.
  `agent_out` has no dedup, matching `message_out`'s existing posture (an
  author's own log is never a source of duplicate entries for itself).
- **`fromAgent` marks the history apart.** Kotlin's `FoldedMessage` gained a
  `fromAgent: Boolean = false` field (`true` for both agent kinds), so
  `rebuildProjection` and any other consumer can tell a session
  conversation's history apart from an ordinary peer conversation's without
  re-deriving it from the raw kind byte.
- **Auto-creating the conversation.** A device receiving a relayed `agent_in`
  for a `conversation` (session pk) it has no existing conversation for
  auto-creates one (LLM kind, hex-fallback name) rather than dropping the
  history — this is what lets a phone see a session it never connected to
  directly, purely via the relay's log — and fires the identity's normal
  new-message notification path for it, computed from the **sync-vector
  delta** of that one sync round (never "every `agent_in` currently in the
  fold"), so a rebuild or bootstrap replay of already-seen entries never
  re-notifies.

See [`relay/design.md`](../../changes/cli-multi-session-relay/design-pages/relay-design.md)
for the full agent-chat delivery story (why a session ends up writing to the
relay's log in the first place, admission checks, etc.) — this section only
covers how those entries fold once they're in a log.

## Why per-writer logs and version vectors, not a CRDT or one canonical chain

(`multi-device-identity` design.md Decision 4.) Two devices appending to a
single canonical chain concurrently would fork it, and resolving that fork
is consensus — exactly the kind of coordination this design set out to
avoid needing. Making every device the sole writer of its own log turns
concurrent appends into a non-problem: nothing ever forks, because nothing
but that one device ever appends to it.

A CRDT library (automerge, yrs, loro) was the other candidate and was
rejected for two reasons: none has a mature Kotlin-Multiplatform binding
today, and message history is not a concurrently-edited document — it is an
append-and-replay problem, which a per-writer log plus a small
last-writer-wins/OR-Set-style fold already solves for every state shape this
identity needs (contacts: add/remove by latest lamport; profile: per-field
last-writer-wins). A version vector over a handful of devices is a tiny map,
trivial to spec and reason about; a new device simply sends an empty one and
receives everything, which doubles as the bootstrap-from-scratch case with
no separate code path.

## Cross-device display ordering

Every fold sorts entries by **`(lamport, ts_ms, device_pk)` ascending** — total,
deterministic, and requires no coordination between devices to agree on. Two
siblings holding the same set of entries always sort them identically
regardless of what order they arrived in, which is exactly what the spec's
"Same logs, same state" scenario requires. `ts_ms` is a tie-break only, never
the primary key — wall clocks across devices are not assumed to agree, which
is why `lamport` (incremented past the highest value seen *anywhere*, not
just locally) is the primary order.

## The `azula/sync/0` frame exchange

Newline-delimited JSON, symmetric in both directions:

1. **Mutual `SyncHello{cert}`.** Each side verifies the other's presented
   certificate: it must decode and pass self-contained verification
   (signature, expiry), its `root_pk` must equal *this device's own* root
   key, it must not be in this device's revocation set, and its `device_pk`
   must equal the connection's actual transport peer id. Any failure closes
   the connection immediately — no `SyncVector`, no further writes at all.
   This is the spec's "Sync Runs Only Between Same-Root Certified Devices"
   requirement; see [`device-linking.md`](../device-linking/design.md) for why
   the binding check matters.
2. **Both sides send `SyncVector{vector}`** — device public key hex to the
   highest **contiguous** `seq` held for that device. A device this side has
   never heard of is simply absent from the map.
3. **Each side streams `SyncEntries{entries}`** for whatever the *other*
   side's vector says it's missing: per-device, ascending `seq`, batched to
   **at most 64 entries per frame** (`MAX_ENTRIES_PER_FRAME`). A brand-new
   device sends an empty vector and so receives everything — bootstrap is
   just the largest possible gap, not a separate mechanism.
4. **Both send `SyncAck{vector}`**, marking the catch-up phase complete.
5. **Live push, no further vector exchange, ever:** while the connection
   stays open, each side watches its own store for new entries (Kotlin:
   `EventLogStore.changeVersion`, a `StateFlow<Long>` bumped by every
   accepted append; Rust: a `tokio::sync::Notify`) and, on every change,
   recomputes its *entire current vector* and pushes whatever is newer than
   what it already sent for each device — never incrementally. That
   "recompute the whole vector, then diff" design means a burst of appends
   that coalesces into a single observed wakeup (or a wakeup a slow
   collector missed entirely) can never lose an entry; at worst two pushes
   merge into one.

Both implementations are structured the same way: a small, testable
"whole protocol over any reader/writer pair" core (`run_session` /
`runSyncSession`) with no real socket involved, plus thin iroh wiring on top
(`SyncHandler`/`dial_sync` in Rust; a caller-supplied `P2pStream` in Kotlin).
The two interoperate over the wire — same frame shapes, same batching limit,
same live-push behavior — without ever having been run against each other in
this change (no combined Rust↔Kotlin integration test exists yet; the
cross-language guarantee here rests on the codec/vector agreement below plus
matching protocol logic, not an end-to-end run).

## The deterministic fold and its rebuild property

`AccountSyncFold.fold`/`eventlog`'s fold logic (Rust doesn't yet have its own
`Fold`; Kotlin's lives in `sync-api/AccountSyncFold.kt`) takes the union of
every device's entries, sorts by the total order above, and derives:

- **Conversations** — every `message_out`/`message_in` in fold order,
  deduplicated by `(conversation, id)` when `id` is present (see "Chat.id
  dedup" below).
- **Contacts** — present iff the highest-ordered `contact_add`/
  `contact_remove` entry for that key was an add; the display name comes
  from that same entry.
- **Device set** — the union of `device_add` certificates whose embedded
  certificate independently verifies (root match, signature, expiry) minus
  any device named by a verified `device_revoke`. Kotlin's fold goes
  slightly beyond the letter of the spec here (which only requires
  revocations to be verified) by also re-verifying each `device_add`'s own
  certificate: without that, any device with log-write access could inject
  an unverifiable certificate and the "device set" would stop being a
  security boundary.
- **Read state** — the highest `up_to_lamport` from a `read_marker` entry,
  per conversation.
- **Profile** — each field (`name`, `description`) independently
  last-writer-wins by fold order; a body that omits a field leaves an
  earlier value untouched rather than clearing it.

**Rebuild property:** because the fold is a pure function of the raw log
bytes, any device can delete its derived stores entirely and reconstruct
identical state by replaying its logs — the spec's "Projection rebuild"
scenario. `AccountSyncService.rebuildProjection` in `shared` exercises
exactly this for message history: it re-derives every conversation's
plain-text history from the fold and splices it back in, leaving
non-text messages (attachments, A2UI cards — outside the log's scope by
design, see the change's Non-Goals) untouched. A companion,
`backfillLegacyHistory`, runs the same conversion once in the opposite
direction for a pre-upgrade install: its existing plain-text history is
converted into `message_out`/`message_in` entries (with no `id`, since it
predates the wire `Chat.id` field, so it can never be deduplicated — exactly
as a genuine legacy message never would be).

## Unknown-kind passthrough

A `kind` byte this build doesn't recognize decodes to `Kind::Unknown(byte)` /
`EventKind.fromByte(...) == null` rather than being rejected. The entry is
still fully validated as a log entry (signature, `seq`, `prev_hash`) and is
stored and re-served during sync exactly like any other entry — it is only
excluded from *this* device's own derived state. This is what lets a newer
sibling introduce a new event kind without breaking older devices in the
identity: an old device simply carries the new kind's entries along without
understanding them, ready to fold them in correctly the moment it upgrades.
Both the Rust and Kotlin codecs round-trip an unknown kind byte-for-byte
(`unknown_kind_byte_round_trips` in `eventlog.rs`).

## The mailbox role, now also "the relay"

A device whose certificate carries the mailbox role bit is not special
infrastructure — it is an ordinary sibling device that additionally commits
to always being reachable and to retaining the identity's full logs. Since
cli-multi-session-relay this role is user-facing as **`azula relay`**
(`azula mailbox` is kept as an exact alias — same command, same identity,
same wire-level role bit; nothing about the certificate flag or its meaning
changed, only the name a human types). `mailbox_role.rs` (module/internal
names intentionally kept as-is, per that change's task 4.1) is the only
implementation of this role today:

- It loads the identity `azula link` persisted, binds that device's node
  key, and serves **four** ALPNs: the identity's chat ALPN (`azula/chat/0`,
  `ChatHandler`), the LLM ALPN (`azula/llm/0`, `RelayLlmHandler` — new,
  agent chat + A2UI snapshots, see below), sync (`azula/sync/0`, the same
  `SyncHandler` any device uses, now with a snapshot-replay hook — see
  below), and link (`azula/link/0`, always via `RootlessLinkHandler` — a
  relay holds no root secret and can never grant a link itself).
- Inbound chat (`azula/chat/0`) is gated by `accept_gate::gate_peer`/`CertGate`
  — a peer presenting a certified root already in this identity's
  known-contacts set is admitted with no invite needed; anything else falls
  through to the ordinary invite path (see
  [`invitations.md`](../invitations/design.md)). Every accepted
  `Frame::Chat` becomes a `message_in` entry on the relay's own log via
  `LogStore::append_own`.
- Inbound agent chat (`azula/llm/0`) is gated differently and more strictly —
  no invite fallback at all: a session must present a `Hello{cert}` whose
  `azd…` cert passes `certs::verify_session_cert` **and** whose `root_pk` is
  already in the *same* live known-roots set `gate_peer` above maintains
  (shared via `ChatHandler::known_roots_handle()`, so a root pinned as a
  contact on one ALPN is recognized on the other). An admitted session's
  `Frame::Chat` becomes an `agent_in` entry (`Kind::AgentIn`, `0x09`),
  keyed by the *session's* public key, not a contact root — see "Agent chat
  fold rules" above and
  [`relay/design.md`](../../changes/cli-multi-session-relay/design-pages/relay-design.md)
  for the full admission/delivery story.
- Store-and-forward needs no dedicated inbox logic at all: because the
  relay is a full sync participant, two sibling devices that are **never
  simultaneously online** still converge purely by each syncing with the
  relay whenever it happens to be online — proven by
  `mailbox_bridges_two_never_concurrently_online_devices`, which runs device
  A alone, syncs it with the relay, drops it, brings up device B alone,
  syncs *that*, and confirms both devices' final logs are byte-identical to
  the relay's without A and B ever touching each other.
- Bootstrap for a brand-new device is the same mechanism again: an empty
  sync vector against the relay alone reproduces the full multi-device
  history with no other sibling ever online
  (`bootstrap_from_an_empty_vector_receives_full_history_from_the_mailbox_only`
  — test name unchanged since the mechanism it proves didn't change).

The CLI's older per-device JSONL bridge mailbox (`mailbox.rs`, used by
`azula mcp`/`azula pair` for offline MCP-bridge delivery) is untouched and
independent — identity-level offline delivery for peer chat is built
entirely on `sync::LogStore` and does not depend on it. Since
cli-multi-session-relay it is also the **last** resort in a session's
delivery chain (direct → relay → this local JSONL queue), not the only
fallback — see [`mcp-bridge/design.md`](../mcp-bridge/design.md#offline-delivery-direct-then-relay-then-the-local-mailbox).

### A2UI state lives outside this log, on the relay only

Account-sync's "Event kinds" table above has no A2UI kind, deliberately: "A2UI
surface state SHALL NOT be written to the log in any kind." The reason is
cost, not a missing feature — a blackjack-style game issuing one `update_ui`
per card flip would, if logged like any other kind, append a full surface
copy **forever**, replicated to **every device in the identity** on every
sync, for state that only ever needs to be its *latest* value. Instead, the
relay keeps a separate bounded side store (`core::relay_a2ui::RelayA2uiStore`
— latest snapshot per `(conversation, surface_id)`, 256 KiB cap, tombstone
for delete) entirely outside `sync::LogStore`, replayed to the phone as
ordinary A2UI wire messages via a narrow hook in the sync protocol
(`sync::PreSyncAckHook`) rather than as log entries at all. Full mechanics —
the store's shape, the coalescing rule, the hook's before-`SyncAck` timing
and why — are documented in
[`relay/design.md`](../../changes/cli-multi-session-relay/design-pages/relay-design.md#a2ui-snapshots-a-bounded-side-store-outside-the-log),
not repeated here; this note exists so a reader of this page's event-kinds
table isn't left wondering where A2UI state went.

## `Chat.id` dedup

The `Chat` frame gained an optional `id` field — 16 random bytes, lowercase
hex — set by senders on new messages. A receiving device's `message_in`
carries the same `id` through to its log entry. The fold deduplicates by
`(conversation, id)`: if a sender times out delivering to one device and
retries the same `id` against a sibling, but the first delivery had actually
succeeded, both deliveries get logged by their respective receiving devices,
and every sibling's fold still shows the message exactly once. Frames
without an `id` (every legacy sender, and backfilled pre-upgrade history) are
never deduplicated — there is nothing to key on.

## On-disk JSONL format

One directory per identity, one file per device, one base64 entry per line —
`eventlog/<root_pk_hex>/<device_pk_hex>.jsonl` (Rust: `sync::LogStore`;
Kotlin: `sync-real`'s `FileEventLogStore`, same layout, same file naming,
under a platform base dir). Both implementations rebuild their in-memory
chain-validation cursor (per-device last-accepted `seq`/hash, plus a
store-wide max-lamport tracker) from these files lazily on first use and
cache it afterward — the file is always the source of truth; the cache only
avoids re-reading and re-validating the whole file on every append. A
corrupt chain found while loading is a hard error (nothing but a successful,
already-validated append ever writes to these files, so corruption can only
mean on-disk damage).

### Log scoping: namespacing the store per root identity

*(`multi-device-identity` task 4.6.)* Before this task, the store was a flat
directory of `<device_pk_hex>.jsonl` files with no binding to which identity
they belonged to. That is a privacy bug, not just an oversight: an existing
single-device install upgrades in place (task 3.2) and becomes its own
identity, backfilling its pre-upgrade history into its own log (task 4.4).
If that device later QR-links into a **different** identity, its pre-link
log entries are still signed by its own device key — a key the new
identity's root has now certified. Nothing in the sync session, the store,
or the fold checks "was this entry authored while its device was a member of
*this* identity" — they only check signature validity, `seq` continuity, and
the `prev_hash` chain, all of which the old entries still satisfy perfectly.
Left flat, the device's entire prior private message history would fold
into the new identity and replicate to every one of its devices the moment
sync ran.

The fix namespaces the store as `eventlog/<root_pk_hex>/<device_pk_hex>.jsonl`,
so enrolling into a (new) identity starts an empty log set under that root's
own subdirectory — the displaced identity's data stays exactly where it was,
untouched on disk, just no longer part of the newly-joined identity's fold.
A one-time migration (`relocate_flat_layout_if_needed` / Kotlin's
`relocateFlatLayoutIfNeeded`) moves any pre-existing flat-layout files under
the current root's subdirectory the first time a store opens against a
directory that predates this namespacing.

**Rejected alternatives, and why:**

- *Clearing the log on enrollment.* Destructive, and it throws away data a
  user might later want archived or recovered — including pre-empting the
  answer task 3.5b needed for the *identity* capability's restore flow
  (whether a displaced root secret's history should survive). Namespacing
  gives 3.5b that answer for free: the old data simply sits untouched under
  its own root's directory.
- *Adding a `root_pk` field to the entry layout.* This is a wire-format
  break — every field offset in the log entry layout above would shift, and
  the cross-language test vectors recorded below (already generated and
  pinned in both languages before this task) would all need regenerating.
  Namespacing the *store*, not the *entry*, achieves the same isolation
  without touching a wire format that two independent implementations
  already agree on byte-for-byte.

The general lesson (recorded alongside the parallel finding in
[`device-linking.md`](../device-linking/design.md#two-implementation-findings)):
every individual check in the sync/fold path — signature, seq continuity,
chain hash — was correct in isolation, and the composition was still wrong,
because none of them encoded the one invariant that actually mattered here
("this log belongs to this identity").

### Base64, not base32

Log entries never get an `"az…"` prefix or base32 encoding — they travel
inside JSON `SyncEntries` frames and sit on disk as **standard, padded**
base64 of their raw wire bytes: Rust's `base64::engine::general_purpose::STANDARD`,
Kotlin's `kotlin.io.encoding.Base64` (default configuration, which is
standard-padded). This is a deliberate departure from the `azd`/`azr`/`azl`
convention: those are meant to be pasted, scanned, and eyeballed, so
unpadded lowercase base32 keeps them shorter and case-insensitive-friendly;
a log entry is neither shared nor displayed, so ordinary base64 (denser,
and needing no bespoke codec) is the simpler choice. The three-entry
cross-language vector below is byte-identical proof that both languages
agree on this: Kotlin's `CrossLanguageVectorTest` decodes the same base64
literals Rust's test asserts against and re-encodes them unchanged.

## Cross-language test vector: three-entry log, extended to four

Recorded by task 2.4 (`cargo test cross_language_vector` in `azula-cli`:
`eventlog::tests::cross_language_vector_three_entry_log` in
`src/eventlog.rs`), mirrored by `CrossLanguageVectorTest` in
`azula-app/core/test/`. All three entries are authored by a single device
(`device_a_pk`, derived from 32 sequential seed bytes `0x60..=0x7f`):

```
device_a_pk = 174553b456dddfc6908ecab1c101fe6ab21e2baa0617795b7d43a63482993fd5
```

| seq | kind | lamport | ts_ms | body |
|---|---|---|---|---|
| 1 | `0x01` message_out | 1 | 1700000000000 | `{"conversation":"cafebabe","text":"hello"}` |
| 2 | `0x01` message_out | 2 | 1700000001000 | `{"conversation":"cafebabe","text":"how are you?"}` |
| 3 | `0x03` read_marker | 3 | 1700000002000 | `{"conversation":"cafebabe","up_to_lamport":2}` |

Chained by `prev_hash` = SHA-256 of the previous entry's full wire bytes
(all-zero at `seq` 1). Entry 1, base64 (standard, padded):

```
AQEXRVO0Vt3fxpCOyrHBAf5qsh4rqgYXeVt9Q6Y0gpk/1QAAAAAAAAABAAAAAAAAAAEAAAGLz+VoAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAKnsiY29udmVyc2F0aW9uIjoiY2FmZWJhYmUiLCJ0ZXh0IjoiaGVsbG8ifcGRps3rZKzaqY89ynl1jzSQHWo5uV7rH7c99fvWTKXitnG6toGFF22x7msZ8FfCOM5pI8np8hIEcoKU6zpD3g8=
```

`hash(entry1)` (hex) = `93c4d82843cc79f33f53416abf84fb6128b758416a18f46122fadee797bdf17e` — entry 2's `prev_hash`.

Entry 2, base64:

```
AQEXRVO0Vt3fxpCOyrHBAf5qsh4rqgYXeVt9Q6Y0gpk/1QAAAAAAAAACAAAAAAAAAAIAAAGLz+Vr6JPE2ChDzHnzP1NBar+E+2Eot1hBahj0YSL63ueXvfF+AAAAMXsiY29udmVyc2F0aW9uIjoiY2FmZWJhYmUiLCJ0ZXh0IjoiaG93IGFyZSB5b3U/In3kE3/9rXJwLJWL1Pi6E0zhf0U/JhmcFx5J0XMo1c/TXIXHlESSlq7nv/F9a98bySkg0wbjfO6k4BXOKq7Q6ewC
```

`hash(entry2)` (hex) = `92b106995ea0545ac0252992bd6bc0a26c4ed3015f640b4c2b3dfc2224ba8712` — entry 3's `prev_hash`.

Entry 3, base64:

```
AQMXRVO0Vt3fxpCOyrHBAf5qsh4rqgYXeVt9Q6Y0gpk/1QAAAAAAAAADAAAAAAAAAAMAAAGLz+Vv0JKxBpleoFRawCUpkr1rwKJsTtMBX2QLTCs9/CIkuocSAAAALXsiY29udmVyc2F0aW9uIjoiY2FmZWJhYmUiLCJ1cF90b19sYW1wb3J0IjoyfYGB/vAipgFl+KPw+qRjJ1Ei+/BX2gcb7DBqCp5OY/i01eZnE4ixyjLEKCzwG2yZ+pcXpkoPcb6dv0gcpWRPAgE=
```

`hash(entry3)` (hex) = `6afc397dde714ef7c9d8e7811d0f608f3fc9d508ad7873a0112eadd85a93004b`.

**Result:** first run, Rust and Kotlin agreed on every field and every byte
of the re-encode with no implementation changes needed on either side — both
codecs were already in lockstep. Kotlin also independently recomputes the
`prev_hash` SHA-256 chain over its own re-encoded bytes and checks it against
the hashes above, so a chain-hashing disagreement between languages would
have been caught too, separately from the raw byte-equality check.

Kotlin does not (yet) verify the Ed25519 signature bytes embedded in these
entries — same gap as `device-linking.md`'s "Remaining gap": `core` has no
real Ed25519 until `network-real` can supply one from iroh-kmp.

### Fourth entry: `agent_in` chained after entry 3 (task 4.2)

The relay capability (cli-multi-session-relay) extends this same vector with
a fourth entry, `Kind::AgentIn` (`0x09`), chained after entry 3 above — same
author (`device_a_pk`), `seq` 4, `lamport` 4, `prev_hash = hash(entry3)`:

```
body: {"conversation":"cafebabe","text":"hello from claude","id":"00112233445566778899aabbccddeeff","from_name":"Claude"}
```

Entry 4, base64 (standard, padded):

```
AQkXRVO0Vt3fxpCOyrHBAf5qsh4rqgYXeVt9Q6Y0gpk/1QAAAAAAAAAEAAAAAAAAAAQAAAGLz+VzuGr8OX3ecU73ydjngR0PYI8/ydUIrXhzoBEurdhakwBLAAAAc3siY29udmVyc2F0aW9uIjoiY2FmZWJhYmUiLCJ0ZXh0IjoiaGVsbG8gZnJvbSBjbGF1ZGUiLCJpZCI6IjAwMTEyMjMzNDQ1NTY2Nzc4ODk5YWFiYmNjZGRlZWZmIiwiZnJvbV9uYW1lIjoiQ2xhdWRlIn23LV+7/fV81iMfv/PrprZt9lfbZZY/+OexSqyBPoqhHHt28rCquBnuNQOFpU2Sc1+epS98Fre41O87NDdm/ykP
```

`hash(entry4)` (hex) = `522670c48faff21d9ff3558aa93aef34999ec625e5a1d322082a6ff6a6676433`.

Kotlin's test for this entry
(`CrossLanguageVectorTest.agentInEntryChainedAfterTheThreeEntryVectorDecodesAndReEncodesByteIdentical`)
decodes this exact base64 literal, asserts every field (author, kind, `seq`,
`lamport`, `ts_ms`, `prev_hash == hash(entry3)`, the body bytes verbatim),
re-encodes and checks byte-identity against the same literal, and
independently recomputes the SHA-256 hash and checks it against
`522670c4…` above — the same three-way check (decode, re-encode,
re-hash) the original three-entry vector performs. Unlike the original
vector, this entry is signed with **real Ed25519** (`network-real`'s
`IrohKmpEd25519`, backed by iroh-kmp) on the Rust side that generated the
fixture, rather than a `FakeEd25519` stand-in; the Kotlin test still only
decodes/re-encodes/hash-checks (no live signature verification), for the
same "no real Ed25519 in `core` yet" reason noted above.

## Implementation status (as of this writing)

- **Rust (`azula-cli`):** codecs, chain validation, the full sync session
  (`sync.rs`), and the mailbox role (`mailbox_role.rs`) are implemented and
  tested (228 tests, clippy-clean per task 9.1), including the
  never-concurrently-online convergence and empty-vector-bootstrap
  scenarios above.
- **Kotlin (`azula-app`):** the codec (`EventLog.kt`), fold
  (`AccountSyncFold.kt`), event-log store (`EventLogStore`/
  `FileEventLogStore`), and sync session (`SyncSession.kt`) are all
  implemented, matching the Rust reference frame-for-frame. `AccountSyncService`
  wires `message_out`/`message_in`/`read_marker` appends into the existing
  send/receive/read paths, and provides the rebuild
  (`rebuildProjection`) and one-time backfill (`backfillLegacyHistory`)
  conversions between the log and the pre-existing `MessageStore`.
- **Not yet implemented on the Kotlin side:** sibling discovery/dial (task
  5.4 — nothing yet decides *who* to open a sync session with, or dials
  siblings on reconnect), multi-device send with dial-order/first-success
  semantics (task 7.4), and keying conversations by certified root pk
  instead of legacy node id (task 7.3, so `conversation` above is a node id
  for every contact today, not yet a root pk for certified ones). A `-mock`/
  `FakeTransport` two-device sync test and broader Kotlin unit-test coverage
  (task 9.2) are also outstanding, as is an end-to-end manual pass across
  phone/desktop/CLI-mailbox (task 9.3) and a migration pass on an existing
  install (task 9.4).
- **cli-multi-session-relay's `agent_in`/`agent_out` (`0x09`/`0x0A`):**
  implemented on both sides — Rust's `mailbox_role::run_llm_session` admits
  and appends `agent_in`; Kotlin's `AccountSyncFold`/`AccountSyncService`
  fold, dedup, auto-create-conversation, and notify. The A2UI-snapshot
  replay path (`Frame::SyncA2ui`, the relay's `PreSyncAckHook`) is likewise
  implemented on both sides. See
  [`relay/design.md`](../../changes/cli-multi-session-relay/design-pages/relay-design.md)
  for the full picture and its own open items (the `--relay` link-enrollment
  flag, and the still-TODO relayed CI/terminal notification push).

## Verifying changes here

- Rust: `cargo test` in `azula-cli` (`eventlog`, `sync`, `mailbox_role`
  modules).
- Kotlin: `./check -m sync-api -m sync-real -m core` from `azula-app/`
  (`AccountSyncFoldTest`, `EventBodiesTest`, `FileEventLogStoreTest`,
  `SyncSessionTest`, `CrossLanguageVectorTest`).
