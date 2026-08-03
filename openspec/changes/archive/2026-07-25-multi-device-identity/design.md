# Multi-Device Identity Design

## Context

Today an azula identity is exactly one iroh endpoint keypair (`identity`
spec): the endpoint id is the identity, contacts/invites/conversations key on
it, history is per-device JSON with no sync, and restore-from-phrase
*replaces* a device's key (the in-flight `recovery-restore-ux` change is
already wrestling with those semantics). The CLI's `serve`/`serve-mcp`
daemons hold separate persistent endpoint identities and the bridge has a
per-device JSONL mailbox — the only store-and-forward in the system.

Research inputs that shaped this design:

- **iroh 1.0 is connectivity-only.** Gossip/docs/blobs are spun-out,
  pre-1.0, separately-versioned crates. iroh-gossip is best-effort with a
  ~4 KiB message cap and **no retention or replay for offline peers** — it
  cannot carry delivery or history. iroh-docs would give us a multi-writer
  KV store but drags in blobs+gossip and is the least mature of the three.
- **CRDT libraries** (automerge, yrs, loro) all have an immature
  Kotlin-Multiplatform story, and message history is not a
  concurrently-edited document — it is an append-and-replay problem.
- **Prior art converges** (Matrix cross-signing, Jami's account-CA, ATProto
  PDS, p2panda/Bamboo, Berty): a root identity key signs per-device
  certificates; state is signed append-only logs replicated between the
  identity's devices; an always-online endpoint is "just another device" that
  stores and forwards. p2panda-net implements exactly this on iroh
  (log-sync for catch-up + gossip only for live nudges).

## Goals / Non-Goals

**Goals:**

- One identity (root keypair) across N devices; peers see one stable
  contact regardless of which device is talking.
- Send and receive from any device; history, contacts, and read-state
  converge on every device.
- An always-online azula-cli device with the `mailbox` role receives on
  the identity's behalf while other devices are offline and fans out on
  reconnect.
- Existing single-device users migrate without changing their recovery
  phrase or breaking existing contacts.
- Every mechanism is implementable by a less-capable LLM from the spec:
  fixed binary layouts, per-writer append-only logs, version vectors — no
  CRDT merge functions, no consensus.

**Non-Goals:**

- Auto-responder bot. Deliberately deferred: once this lands a bot is
  "one more device cert with the reserved `bot` role flag" driving the
  existing `azula serve` LLM relay — a small follow-up change. Sal is
  still deciding whether he wants it at all.
- Presence/typing indicators (iroh-gossip is the right fit later; nothing
  here precludes it).
- Push notifications (FCM/APNs), group conversations, log compaction,
  and E2E-encrypting the log at rest — all future changes.
- Media bodies inside the log. The log carries blob references; bodies
  keep using the existing media-transfer pull protocol (now also between
  the identity's own devices).

## Decisions

### 1. Root identity keypair above device endpoint keys

A root Ed25519 keypair is the identity. Each device keeps its own iroh
endpoint keypair for transport and holds a **device certificate** signed by
the root key. Contacts pin the root public key.

- *Why not share one endpoint secret across devices?* Two live iroh endpoints
  with the same endpoint key is undefined/untested behavior (discovery and
  relay routing assume endpoint id ↔ one endpoint), and revocation would be
  impossible — you cannot un-share a secret (the Nostr footgun).
- *Why not iroh-docs' namespace/author keys?* Unblessed pre-1.0 crate,
  heavy dependency chain, and set-reconciliation internals are much harder
  to spec for a smaller implementing model than cursor-based log exchange.

**Migration is the clever part:** on upgrade, the existing 32-byte endpoint
secret **becomes the root secret**, and the migrating device initially
keeps using it as its device key too (a self-certificate where
`device_pubkey == root_pubkey` is valid). The recovery phrase is
unchanged, the endpoint id peers dial is unchanged, and legacy contacts that
pinned the old endpoint id are automatically pinning the root key. Only
newly-linked devices mint distinct endpoint keys.

### 2. Device certificates: fixed binary layout, `azd` encoding

Following the invite payload's house style (fixed big-endian layout,
`"az…"` prefix + unpadded lowercase RFC 4648 base32):

```
version    1B  = 0x01
flags      1B  bit0 = mailbox role, bit1 = bot role (reserved, never set
               in this change), bits 2–7 reserved (0 on encode, ignored)
root_pk   32B  Ed25519 root public key
device_pk 32B  Ed25519 device (iroh endpoint) public key
issued_at  4B  u32 unix seconds
expires_at 4B  u32 unix seconds, 0 = never
name_len   1B  0–63
name       nB  UTF-8 device display name
signature 64B  Ed25519 by root secret over all preceding bytes
```

Encoded form: `"azd" + base32(payload)`. A certificate is
**self-contained**: verification needs no lookup — check version, verify
signature against the embedded `root_pk`, check expiry, then check the
verifier's revocation knowledge.

A **revocation statement** is the same idea:

```
version 1B = 0x01 | root_pk 32B | device_pk 32B | revoked_at 4B
| signature 64B by root over preceding bytes
```

encoded as `"azr" + base32(payload)`. A verified revocation permanently
invalidates that device's certificate regardless of expiry.

### 3. Enrollment: QR-link grants a certificate, the phrase grants root

Two ways a device joins an identity, with different authority:

- **Phrase enrollment** (restore flow): the device decodes the root
  secret from the 24 words, self-issues its certificate, and holds full
  root authority (can enroll and revoke other devices). This replaces
  the old "restore overwrites the identity" semantics and subsumes the
  `recovery-restore-ux` open questions.
- **QR-link enrollment**: the new device generates a endpoint keypair and
  displays a link QR (`"azl" + base32` of `version 1B | device_pk 32B |
  name_len 1B | name nB | ticket_len 2B | ticket nB`). An existing
  root-holding device scans it, dials the embedded ticket on the new
  `azula/link/0` ALPN, both devices display the same **4 verification
  words** (indices from the first 44 bits of
  `SHA-256(smaller_pk || larger_pk)` into the BIP-39 wordlist — reusing
  the existing wordlist code), and after explicit user confirmation on
  the *existing* device it sends the certificate plus an identity bundle
  (root pubkey, all known certs and revocations, contact snapshot,
  mailbox hint). The QR-linked device holds **no root secret** — it can
  message as the identity but cannot enroll or revoke.

The CLI enrolls the same way in reverse presentation: `azula link` prints
the QR to the terminal (reusing `qr.rs`) and the app scans it; the
confirmation still happens on the app (the root-holding side). The
`--mailbox` flag on `azula link` asks for the mailbox role bit; the
root-holding device shows the requested role in its confirmation UI.

`azula/link/0` frames are newline-delimited JSON like every other ALPN:
`LinkHello{device_pk, name, roles}` → `LinkGrant{cert, bundle}` or
`LinkReject{reason}`.

### 4. Per-device append-only logs + version vectors (no CRDT library)

Every device owns exactly one append-only log of signed entries; it is
the **single writer** of that log, so a per-log hash chain never forks
and no merge logic exists anywhere. The identity's state is a
deterministic fold over the union of its devices' logs.

Entry layout (big-endian, transported base64 inside JSON sync frames):

```
version    1B  = 0x01
kind       1B  0x01 message_out, 0x02 message_in, 0x03 read_marker,
               0x04 contact_add, 0x05 contact_remove, 0x06 device_add,
               0x07 device_revoke, 0x08 profile_update
device_pk 32B  author device public key
seq        8B  u64, per-device, first entry is 1, strictly +1
lamport    8B  u64, max(lamport seen anywhere)+1 at append time
ts_ms      8B  u64 unix milliseconds (display only, never ordering)
prev_hash 32B  SHA-256 of the previous entry's full bytes (zeros @ seq 1)
body_len   4B  u32
body       nB  UTF-8 JSON, kind-specific
signature 64B  Ed25519 by the device key over all preceding bytes
```

Sync (`azula/sync/0`, newline-delimited JSON) runs **only between devices
whose certificates verify against the same root**, mutually, at connect:
`SyncHello{cert}` both ways → `SyncVector{ {device_pk_hex: highest_seq} }`
both ways → each side streams `SyncEntries{entries:[b64,…]}` (≤64 entries
per frame) for anything the other lacks, in per-device seq order →
`SyncAck{vector}`. While connected, newly appended entries are pushed
immediately (live mode — the p2panda pattern, minus gossip). A version
vector over ≤ a handful of devices is a tiny map; a new device sends an
empty vector and receives everything (bootstrap = replay).

Cross-device display ordering: `(lamport, ts_ms, device_pk)` — total,
deterministic, and requires no coordination.

- *Why not one canonical chain?* Two devices appending concurrently would
  fork it; resolving forks is consensus. Per-writer logs make concurrency
  a non-problem.
- *Why not automerge/yrs/loro?* KMP binding gaps, and vastly more spec
  surface for the implementing model. An OR-Set/LWW fold over log entries
  (contacts: add/remove by latest lamport; profile: last-writer-wins)
  gives the same result for our state shapes.

### 5. Delivery: any device counts, mailbox is just a durable device

Sending to a contact: dial their devices — most-recently-seen first, then
the mailbox-role cert — and **first successful delivery wins**. The
receiving device appends `message_in`; every other device of that
identity learns it via sync. Store-and-forward therefore falls out of
"the mailbox device is always reachable and syncs like any sibling" —
it needs no special inbox code beyond retaining its log.

Duplicate suppression: `Chat` frames gain an optional `id` (16 random
bytes, hex) so a sender retrying against a second device after an
ambiguous failure is deduplicated by `(sender_root, id)` at fold time.
The existing CLI-bridge JSONL mailbox stays as-is for bridge tooling;
identity-level offline delivery supersedes it for peer chat.

If *no* device of the recipient is reachable, the sender's existing
reconnect-and-retry behavior applies unchanged — but now "unreachable"
requires every device including the mailbox to be down.

### 6. Trust-gate extension, not replacement

The invitations model is untouched at its core (issuer-authoritative
store, device-scoped tickets). Two additions: `Hello` carries an optional
`cert` field, and "known peer" extends from endpoint-id matching to
"presented cert verifies and its `root_pk` is in contacts." A cert that
fails verification is treated as absent (the connection falls into the
existing stranger/invite path — it grants nothing). Accepting a
cert-bearing stranger records the root key as the contact.

### 7. Where code lands

- **iroh-kmp** (additive free functions only, per its spec): Ed25519
  keypair generation, sign, and verify over raw 32-byte keys, so Kotlin
  can do root-key operations without a new crypto dependency. Needs a
  Maven Central version bump before azula-app can consume it.
- **azula-app**: new `sync-api`/`sync-real` feature modules via the
  `architecture-di` recipe (log store, fold, sync client/server, link
  flow UI); `network-api` gains the new ALPNs and frames; `MessageStore`
  becomes a projection rebuildable from the log.
- **azula-cli**: cert/entry codecs in a new `identity2.rs`-style module
  (shared layouts with the app kept in lockstep like `proto.rs` ↔
  `Protocol.kt`); `azula link [--mailbox]`; a `mailbox` long-running mode
  reusing the `serve` daemon scaffolding.

## Cross-Language Test Vectors

Recorded by task 2.4: `cargo test cross_language_vector` in `azula-cli` (`certs::tests::cross_language_vector_cert_and_revocation`
in `src/certs.rs`, `eventlog::tests::cross_language_vector_three_entry_log` in
`src/eventlog.rs`), mirrored by `CrossLanguageVectorTest` in `azula-app/core/test/`. Rust
generates every vector with **real Ed25519** (`iroh::SecretKey`) from fixed seeds; Kotlin's
`core` module has no real Ed25519 (see `FakeEd25519`'s kdoc in
`core/test/CryptoTestFixtures.kt`), so it decodes these exact literals, checks every field, and
re-encodes, asserting a byte-identical result. That round trip is only possible if both
implementations agree on every field offset, width, endianness, and encoding alphabet — the
actual cross-language proof. Kotlin also independently recomputes the `prev_hash` SHA-256 chain
over its own re-encoded bytes and checks it against the same hashes, so a chain-hashing
disagreement between languages would be caught too. Kotlin does not (yet) verify the Ed25519
signatures themselves; see "Remaining gap" below. This section is written to be lifted verbatim
into `device-linking`'s and `account-sync`'s archive-time `design.md` companions (task 9.5) —
the certificate/revocation vectors belong to `device-linking`, the log vectors to
`account-sync`.

### Seeds

- `ROOT_SEED` = 32 sequential bytes `0x00..=0x1f` (`certs.rs::tests::fixtures::ROOT_SEED`)
- `DEVICE_SEED` = 32 sequential bytes `0x20..=0x3f` (`certs.rs::tests::fixtures::DEVICE_SEED`)
- `DEVICE_A_SEED` = 32 sequential bytes `0x60..=0x7f` (`eventlog.rs::tests::fixtures::DEVICE_A_SEED`)

### Derived public keys (hex)

- `root_pk` = `03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8`
- `device_pk` = `29acbae141bccaf0b22e1a94d34d0bc7361e526d0bfe12c89794bc9322966dd7`
- `device_a_pk` = `174553b456dddfc6908ecab1c101fe6ab21e2baa0617795b7d43a63482993fd5`

### Device certificate (`azd`) — feeds `device-linking`

Input fields: `version=1`, `flags=0x01` (mailbox role), `root_pk`, `device_pk`,
`issued_at=1700000000`, `expires_at=0` (never), `name="phone"`.

```
azdaeaqhiihx7z44ef6dvyn2ghhjpajsz7e2yyjxjinl4o5zbtecjktdobjvs5ocqn4zlylelq2stju2c6hgypfe3il7yjmrf4uxsjsfftn25svh4iaaaaaaaafobug63tfmaoceghoxhw2izrder7gokgmn5mtfm6dcccvqx376ddtmdz5swwdr4wykbkbc6bepxvgiufuqe2anhvsakshdxcriw5q2yly35bjidq
```

### Revocation statement (`azr`) — feeds `device-linking`

Input fields: `version=1`, `root_pk`,
`device_pk=29acbae141bccaf0b22e1a94d34d0bc7361e526d0bfe12c89794bc9322966dd7` (revoking the same
device the cert above names), `revoked_at=1700100000`.

```
azraeb2cb576phbbpq5odorrz2lycmwpzgwgcn2kdk7dxoimzaskuy3qknmxlqudpgk6czc4guu2ngqxrzwdzjg2c76clejpff4smrjm3oxmvkxpiaxs7pd5e3ex3xekzy7yomqy3hyyshxcsw275gv7gbi45c7buxlsjmywp7nnwtixxhfixig32cgjge624upt6tztt2eqovmqiroq4ma4
```

### Three-entry log (single device: `device_a_pk`) — feeds `account-sync`

All three entries are authored by `device_a_pk`, chained by `prev_hash` = SHA-256 of the
previous entry's full wire bytes (all-zero at `seq` 1). Transported as base64 (standard,
padded) of the raw wire bytes, per `eventlog.rs`'s `to_base64`/`LogEntryCodec` convention.

| seq | kind | lamport | ts_ms | body |
| --- | --- | --- | --- | --- |
| 1 | `0x01` message_out | 1 | 1700000000000 | `{"conversation":"cafebabe","text":"hello"}` |
| 2 | `0x01` message_out | 2 | 1700000001000 | `{"conversation":"cafebabe","text":"how are you?"}` |
| 3 | `0x03` read_marker | 3 | 1700000002000 | `{"conversation":"cafebabe","up_to_lamport":2}` |

Entry 1 (`prev_hash` = all zeros), base64:
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

### Cross-language result

First run: Rust and Kotlin agreed on every field and every byte of the re-encode with no
implementation changes needed on either side — both codecs were already in lockstep. No
discrepancy to report.

### Remaining gap

Kotlin's `core` module cannot perform real Ed25519 *verification* of the signatures above (only
`FakeEd25519`, a test-only stand-in — see its kdoc in `core/test/CryptoTestFixtures.kt`); real
Ed25519 lives in iroh-kmp, which is blocked on a Maven Central publish (task 1.3) still in
flight. `CrossLanguageVectorTest` decodes and re-encodes (proving the wire format matches
byte-for-byte) but does not assert `ed25519_verify(root_pk, ..., signature) == true` against the
real signature bytes. Tracked as a follow-up once iroh-kmp's Central version lands and
`network-real` can supply a real `Ed25519` to `core`'s test source set (or a dedicated
integration test module that does depend on it).

## Risks / Trade-offs

- [Root secret lives on every phrase-enrolled device] → Same exposure as
  today's phrase model (no PIN layer, spec'd as such); QR-linked devices
  deliberately hold no root secret, and the phrase-holder can revoke.
- [Log grows without bound] → Accepted for v1 (text entries are small);
  compaction/snapshot is an explicit future change; media bodies are
  already out of the log.
- [Revocation reaches contacts lazily] → Own devices enforce on next
  sync; contacts enforce when they next see any of your devices present
  the revocation set. A stolen *QR-linked* device can impersonate until
  then but cannot mint devices; a stolen *root* device is identity
  compromise, unchanged from today's phrase theft.
- [Clock skew vs `expires_at`/`issued_at`] → Same tolerance stance as
  invites; certs may use `expires_at = 0`; revocation, not expiry, is the
  security mechanism.
- [Two devices restored from the same phrase while partitioned] → Both
  hold root and self-certify; nothing forks (separate logs, separate
  device keys); worst case is duplicate self-certs for the same
  `device_pk`, which fold identically.
- [iroh-kmp Central publish latency gates app work] → Sequence tasks so
  the SDK additions land first; app work can develop against
  `publishToMavenLocal` but cannot land until the Central version exists.
- [Legacy peers never send certs] → Fully supported forever: endpoint-id
  keyed conversations and the existing invite gate remain; own-device
  history sync works regardless of what the peer runs.

## Migration Plan

1. Ship iroh-kmp additive crypto functions (new Central version).
2. On first post-upgrade launch, the app treats its existing endpoint secret
   as the root secret (phrase unchanged), self-issues a
   `device_pk == root_pk` certificate, and appends `device_add` — a
   single-device identity, wire-compatible with old peers.
3. Linking, sync, and mailbox features activate as devices are added.
4. Rollback: a migrated single-device identity that never linked a
   second device behaves exactly as before (same key, same endpoint id), so
   rolling the app back is safe until a second device is linked.

## Open Questions

- Should the mailbox device's log retention be configurable (disk cap)
  before v1, or is "unbounded, revisit with compaction" acceptable?
- Verification-words UX on the CLI (`azula link` prints them; is
  terminal display sufficient, or should the app require typing one?).
- Whether `profile_update` should sync personas at all, given personas
  are per-conversation cosmetics — current lean: sync them, keep them
  excluded from the phrase.
