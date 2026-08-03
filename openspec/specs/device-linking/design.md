# Device Linking — certificates, enrollment, and revocation

Device linking is the layer that turns a single iroh endpoint keypair into one
device of a multi-device **identity** (see [`identity.md`](../identity/design.md)):
a root Ed25519 keypair signs per-device **certificates**, a device presents
its certificate to be recognized as that identity, and a **revocation**
statement permanently kills a certificate that was issued in error or a
device that was lost. [`account-sync.md`](../account-sync/design.md) covers what
certified devices do with each other once linked (the event log and its sync
protocol); this page covers how a device gets a certificate in the first
place, what the certificate actually proves, and how it stops proving it.

## Payload layouts

All three payloads are binary, all integers **big-endian**, following the
invite payload's house style ([`invitations.md`](../invitations/design.md)).

**Device certificate (`azd`)** — an association claim binding a device
public key to a root public key, signed by the root secret:

| offset | size | field | notes |
|---|---|---|---|
| 0 | 1 | `version` | `0x01`; reject anything else |
| 1 | 1 | `flags` | bit 0 = mailbox role, bit 1 = bot role (reserved, never set by this change), bits 2–7 reserved (must be `0` on encode, ignored on decode) |
| 2 | 32 | `root_pk` | Ed25519 root public key |
| 34 | 32 | `device_pk` | Ed25519 device (iroh endpoint) public key |
| 66 | 4 | `issued_at` | unix seconds, u32 |
| 70 | 4 | `expires_at` | unix seconds, u32; `0` = never expires |
| 74 | 1 | `name_len` | 0–63 (`n`) |
| 75 | n | `name` | UTF-8 device display name |
| 75+n | 64 | `signature` | Ed25519 by the root secret over bytes `[0, 75+n)` |

A payload shorter or longer than exactly `75 + name_len + 64` bytes, or with
`name_len > 63`, is rejected outright — never partially processed.

**Revocation statement (`azr`)** — fixed-length, no variable field:

| offset | size | field | notes |
|---|---|---|---|
| 0 | 1 | `version` | `0x01` |
| 1 | 32 | `root_pk` | |
| 33 | 32 | `device_pk` | the revoked device |
| 65 | 4 | `revoked_at` | unix seconds, u32 |
| 69 | 64 | `signature` | Ed25519 by the root secret over bytes `[0, 69)` |

Exactly 133 bytes; any other length is rejected.

**QR-link payload (`azl`)** — unsigned, carries no authority; it's an
invitation to be scanned, not a grant:

| offset | size | field | notes |
|---|---|---|---|
| 0 | 1 | `version` | `0x01` |
| 1 | 32 | `device_pk` | the new device's freshly generated endpoint key |
| 33 | 1 | `name_len` | 0–63 (`n`) |
| 34 | n | `name` | UTF-8 requested display name |
| 34+n | 2 | `ticket_len` | u16, big-endian (`m`) |
| 36+n | m | `ticket` | opaque connect-ticket bytes (e.g. `iroh_tickets::endpoint::EndpointTicket::encode_bytes()`) |

## Encoding convention

All three encode as their three-letter prefix (`"azd"`/`"azr"`/`"azl"`)
followed by **unpadded, lowercase RFC 4648 base32** of the payload — the same
alphabet family iroh tickets use and exactly the convention the invite
payload (`"azi…"`) established. Sharing it is deliberate: one glance at a
pasted string's first three letters tells every part of this codebase
(and a human) which kind of payload it is, and the codec (a hand-rolled,
dependency-free base32 in both `certs.rs` and `DeviceCert.kt`, mirroring
`invite.rs`'s/`Invite.kt`'s) is one implementation reused for four payload
kinds rather than four bespoke ones.

## Certificate verification is self-contained, but binding is the caller's job

Per the spec's "Certificate Verification Is Self-Contained" requirement,
verifying a certificate needs no external lookup: check `version == 1`,
verify the signature against the certificate's *own embedded* `root_pk`, and
check `expires_at` is `0` or in the future. Revocation is deliberately a
separate, caller-supplied check (`DeviceCert::is_revoked_by`/
`DeviceCertCodec.verify`'s `revokedDevicePks`/`revokedDevicePks` parameter) —
verification proper never does a store lookup, so it stays a pure function
of the bytes in hand.

None of that is enough to treat a connection as that device, though. A
certificate is bytes: it travels in `LinkGrant` bundles, `Hello.cert` fields,
and sync exchanges, so anyone who has ever seen a connection to that device
has seen its certificate too. What a certificate cannot do is prove that
whoever is presenting it *right now* holds the matching Ed25519 secret —
only the transport handshake proves that, because iroh's endpoint id **is**
derived from the same keypair the certificate names as `device_pk`. So a
verified certificate confers **nothing** until the caller separately checks
that the connection's actual transport endpoint id equals the certificate's
`device_pk` (`DeviceCert::binds_to_connection` /
`DeviceCert.devicePk` compared against `IncomingConnection.remoteId`). Skip
that check and a certificate copied off the wire from a legitimate exchange
would let a stranger claim to be the identity's phone on a connection they
opened themselves. Every accept path in this codebase (`accept_gate::gate_peer`,
`sync::run_session`'s hello check) does verification and binding as two
explicit, separately-named steps for exactly this reason.

## Verification words

QR-link enrollment displays four words on both devices before any grant is
possible, so a user can catch a QR photographed off someone else's screen or
a relayed/MITM'd link session: the first 44 bits of
`SHA-256(lower_pk || higher_pk)` — the two device public keys sorted
**bytewise ascending** (unsigned byte comparison, first differing byte
decides) — read as four 11-bit big-endian indices into the 2048-word BIP-39
English wordlist (reusing `Bip39Wordlist.kt`'s list rather than inventing a
second one). Sorting the two keys before hashing is what makes the result
**order-independent**: whichever device computes it first, and regardless of
which one is "self" and which is "peer" in that device's own code, both
sides land on the same four words.

Recorded fixed vector (`certs.rs`'s `verification_words_fixed_vector`, real
Ed25519 public keys derived from 32-sequential-byte seeds `0x20..=0x3f` and
`0x40..=0x5f`):

```
verification_words(DEVICE_SEED.public, DEVICE2_SEED.public) = ["lab", "chest", "brief", "dial"]
```

Kotlin's `DeviceCertTest.verificationWordsMatchFixedVector` also pins a fixed
vector, but — unlike the certificate/revocation/log vectors below — it is
**not** the same cross-language vector: `core` has no real Ed25519 (see
"Cross-language test vectors" below), so its fixture keys are
`FakeEd25519`-paired "public keys" (`SHA-256(secret)`), not real Ed25519
public keys, and Kotlin's recorded words (`"common", "monkey", "lunch",
"else"`) are over a different, fake-keyed pair. The word-derivation
algorithm itself needs no Ed25519 at all — it's pure SHA-256 plus a wordlist
lookup — so a genuine cross-language vector is possible in principle; it
just isn't the one either suite currently records. Both suites do verify the
order-independence and different-inputs-differ properties independently.

## The `azula/link/0` frame exchange

QR-link enrollment runs over the `azula/link/0` ALPN, newline-delimited JSON
like every other frame protocol in this codebase:

1. The **new device** generates a endpoint keypair, builds an `azl…` payload
   naming its own `device_pk`, requested name, and a connect ticket to
   itself, and displays it as a QR and copyable string — then listens.
2. The **root-holding device** scans or pastes the payload, decodes it, and
   dials the embedded ticket on `azula/link/0`.
3. Once the connection is up, **both sides compute and display the four
   verification words** from the two device public keys — the new device's
   own generated key, and the root-holding device's own (already-certified)
   endpoint id, which is also the connection's transport peer id from the new
   device's side. This happens before either side sends or reads a single
   `azula/link/0` frame.
4. The new device sends `LinkHello{device_pk, name, roles}` (`roles` carries
   the mailbox bit if requested, e.g. via `azula link --mailbox`) and waits.
5. The root-holding device shows the requested device name and roles and
   requires **explicit user confirmation**. Only on confirmation does it
   issue a certificate for the new device's `device_pk`, build an
   `IdentityBundle` (root public key, all known certificates, the current
   revocation set, a contacts snapshot, and a mailbox hint if one exists),
   and send `LinkGrant{cert, bundle}`. Cancelling sends
   `LinkReject{reason}` and issues nothing.
6. The new device verifies the grant (see "Unverified grants were persisted"
   below) before persisting the certificate and bundle.

A device that has already linked and holds no root secret (any azula-cli
device once `azula link` completes, in particular `azula mailbox`) can never
grant a link to anyone else — if something dials its `azula/link/0` anyway,
it best-effort reads whatever arrives (bounded by a short timeout) and
always replies `LinkReject` naming the reason ("this device holds no root
secret and cannot enroll other devices"). This is `link::RootlessLinkHandler`
in `azula-cli`, and it is the CLI's *only* role in this protocol today — see
"Implementation status" below.

## QR-link vs. phrase enrollment: two different authorities

The two ways a device joins an identity deliberately grant different levels
of trust:

- **Phrase enrollment** (the `identity` capability's restore flow): the
  device decodes the root secret itself from the 24 words, so it holds full
  root authority — it can self-issue its own certificate with no one else's
  involvement, and can subsequently enroll or revoke *other* devices as the
  root-holding side of a QR-link.
- **QR-link enrollment**: the new device never sees the root secret at all.
  It receives only a certificate (proof that some root-holder vouched for
  it) and a read-only bundle snapshot. It can message as the identity, but
  an attempt to issue a certificate or a revocation is simply unavailable —
  there is no root secret on the device to sign one with.

A stolen QR-linked device is therefore bounded: it can impersonate the
identity until revoked, but it can never mint another device or lock the
real owner out. A stolen phrase (or a phrase-enrolled device) is full
identity compromise, unchanged from today's single-device phrase model.

## Two implementation findings

Both were found and fixed during implementation of the Rust side (`tasks.md`
6.5); the Kotlin side does not yet have equivalent wiring to bug-fix (see
"Implementation status"), but the lessons apply there identically once it
does.

**Unverified grants were persisted.** The link flow originally wrote
whatever `LinkGrant` arrived straight to disk with no verification at all —
a malformed certificate, one that named a different device, or one already
revoked in the very bundle it arrived with, would all have been persisted
and only discovered broken later, when `azula mailbox` tried to use it. The
fix (`verify_granted_cert` in `azula-cli/src/main.rs`, called from
`cmd_link` before `linked_identity::save`) checks, in order: the certificate
decodes and verifies (signature + expiry, `DeviceCert::verify`); its
`device_pk` equals *this device's own* freshly generated key
(`binds_to_connection` — a `LinkGrant` should always name the device that
asked, never another); and it is not already revoked per the accompanying
bundle's own revocation set. A grant must be verified before persisting: any
of those failing means nothing is saved.

**Revocation enforcement read a stale snapshot.** Both the sync accept gate
(`sync::run_session`) and the mailbox's chat accept gate
(`mailbox_role::run_chat_session`) originally took their "known revoked
devices" set as a plain argument — populated once, at startup, from the
identity bundle. A `device_revoke` entry a sibling appended and this device
later learned via ordinary sync was validated, chained, and stored
correctly, but never consulted when the accept gate decided whether to trust
a peer's certificate — silently violating the spec's "Own devices enforce
revocation after sync" scenario (the revoked device kept syncing and
kept being treated as known until the process happened to restart). Every
individual check along the way — signature verification, the certificate's
own well-formedness, the connection-binding check — was correct in
isolation; the *composition* was still wrong, because the set they were
checked against was stale. The fix, `LogStore::device_revocations()`,
rescans the store's own logs for verified `device_revoke` entries fresh on
every session and merges the result with the caller's baseline before any
hello is checked (`sync::run_session`, `mailbox_role::run_chat_session`);
see [`account-sync.md`](../account-sync/design.md#the-mailbox-role) for where
that store lives. Kotlin's `runSyncSession` documents the same
recompute-per-session contract in its own doc comment today, ahead of having
a caller that needs it (sibling discovery/dial, task 5.4, is not yet wired).

## Device registry persistence

Each enrolled device persists enough to reconstruct its place in the
identity without re-enrolling if the cache is lost — the spec's "Registry
cache loss is recoverable" scenario. On the CLI, `azula link`'s only
persisted state is `~/.azula/link-identity.json`
(`linked_identity::LinkedIdentity { cert, bundle }`), written once a grant
verifies; the device's own endpoint secret is persisted completely separately,
under the identity name `"link"` (`~/.azula/link.key`, distinct from
`serve`/`bridge`/`blackjack`'s own persistent identities). Losing
`link-identity.json` alone degrades to "run `azula link` again" — the endpoint
key, and therefore the endpoint id peers/siblings already know, survives.
`azula mailbox` reads this same file to serve the mailbox role; it holds no
separate registry of its own.

## Implementation status (as of this writing)

- The wire codecs (`azd`/`azr`/`azl`, verification-word derivation) are
  implemented and cross-language verified in both `azula-cli`
  (`src/certs.rs`) and `azula-app` (`core/src/dev/azula/core/DeviceCert.kt`)
  — see "Cross-language test vectors" below.
- The `azula/link/0` protocol runs end-to-end for the **new-device** role
  only, in the CLI (`azula link`, `src/link.rs`'s
  `run_new_device_session`/`LinkHandler`). The CLI never plays the
  root-holding (granting) role: that requires a root secret, which
  `azula link`'s own identity deliberately never holds.
  `link::RootlessLinkHandler` is what it answers with if dialed anyway.
- The app's device-linking UI — both the new-device flow (generate a key,
  show the QR, accept a grant) and the root-holding flow (scan, show
  verification words, confirm, issue a certificate) — is not yet
  implemented (tasks 6.1–6.3).
- Accept-gate revocation enforcement (`accept_gate::gate_peer`/`CertGate`) is
  implemented and tested on the Rust side, used today by `azula mailbox`'s
  chat ALPN. The app's `ConnectService.isKnownPeer` has not yet been
  extended to check certificates at all (task 6.5's Kotlin half, and task
  7.2) — see [`invitations.md`](../invitations/design.md) for the current
  split between what's spec'd and what's wired.

## Cross-language test vectors

Recorded by task 2.4 (`cargo test cross_language_vector` in `azula-cli`:
`certs::tests::cross_language_vector_cert_and_revocation` in `src/certs.rs`),
mirrored by `CrossLanguageVectorTest` in `azula-app/core/test/`. Rust
generates these with real Ed25519 (`iroh::SecretKey`) from fixed seeds;
Kotlin's `core` module has no real Ed25519 (see `FakeEd25519`'s kdoc in
`core/test/CryptoTestFixtures.kt`), so it decodes these exact literals,
checks every field, and re-encodes, asserting a byte-identical result — the
round trip is only possible if both implementations agree on every field
offset, width, endianness, and encoding alphabet.

**Seeds:**

- `ROOT_SEED` = 32 sequential bytes `0x00..=0x1f`
- `DEVICE_SEED` = 32 sequential bytes `0x20..=0x3f`

**Derived public keys (hex):**

- `root_pk` = `03a107bff3ce10be1d70dd18e74bc09967e4d6309ba50d5f1ddc8664125531b8`
- `device_pk` = `29acbae141bccaf0b22e1a94d34d0bc7361e526d0bfe12c89794bc9322966dd7`

**Device certificate (`azd`)** — `version=1`, `flags=0x01` (mailbox role),
`root_pk`, `device_pk` above, `issued_at=1700000000`, `expires_at=0`
(never), `name="phone"`:

```
azdaeaqhiihx7z44ef6dvyn2ghhjpajsz7e2yyjxjinl4o5zbtecjktdobjvs5ocqn4zlylelq2stju2c6hgypfe3il7yjmrf4uxsjsfftn25svh4iaaaaaaaafobug63tfmaoceghoxhw2izrder7gokgmn5mtfm6dcccvqx376ddtmdz5swwdr4wykbkbc6bepxvgiufuqe2anhvsakshdxcriw5q2yly35bjidq
```

**Revocation statement (`azr`)** — `version=1`, `root_pk` above,
`device_pk` above (revoking the same device the cert names),
`revoked_at=1700100000`:

```
azraeb2cb576phbbpq5odorrz2lycmwpzgwgcn2kdk7dxoimzaskuy3qknmxlqudpgk6czc4guu2ngqxrzwdzjg2c76clejpff4smrjm3oxmvkxpiaxs7pd5e3ex3xekzy7yomqy3hyyshxcsw275gv7gbi45c7buxlsjmywp7nnwtixxhfixig32cgjge624upt6tztt2eqovmqiroq4ma4
```

Both suites also assert: V1-style round trips are byte-identical after
decode/re-encode; a version byte other than `0x01` is rejected; a truncated
or overlong payload is rejected (never partially processed); the signature
verifies against the recorded `root_pk`.

### Remaining gap

Kotlin's `core` cannot perform real Ed25519 *verification* of the signature
bytes above — only `FakeEd25519`, a test-only stand-in. Real Ed25519 lives
in iroh-kmp, which is blocked on a Maven Central publish (task 1.3, since
landed at `app.azula.iroh:iroh-kmp:0.1.2`) reaching a `network-real` build
that can supply a real `Ed25519` to `core`'s test source set.
`CrossLanguageVectorTest` decodes and re-encodes (proving the wire format
matches byte-for-byte) but does not assert
`ed25519_verify(root_pk, ..., signature) == true` against the real signature
bytes. Tracked as a follow-up.

## Verifying changes here

- Rust: `cargo test` in `azula-cli` (certs, link, accept_gate, mailbox_role
  modules).
- Kotlin: `./check -m core` (`DeviceCertTest`, `CrossLanguageVectorTest`) from
  `azula-app/`.
