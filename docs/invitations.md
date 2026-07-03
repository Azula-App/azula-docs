# Invitations — share links, verification, and the pending inbox

The invite payload replaces the raw iroh `EndpointTicket` as the thing azula
shares in links and QR codes. A bare ticket is a permanent bearer credential —
anyone who ever sees it can dial the endpoint forever. An invite still carries
the ticket (so the redeemer can dial), but adds identity (an invite id), a
validity window, optional single-use semantics, and an optional Ed25519
signature by the issuer's node key, and — the actual security gate — **must be
presented back to the issuer at connect time**.

## Trust model

**Issuer-side persistence is authoritative.** The accepting host only ever
verifies invites *it issued*: the gate is "this invite id exists in my local
issued-invite store, is not revoked, not expired, and not consumed (if
single-use)". Revocation is deletion from that store.

The signature is *additive*, not the gate: it lets the redeeming app and the
azula.app invite page check authenticity/tamper-freeness **before dialing**,
and the issuer re-checks it on accept as defense in depth. A purely stateless
signed+expiry scheme was rejected: revocation and the "my invites" list need
issuer-side persistence anyway, and the store lookup makes unsigned invites
just as safe on the accept side.

Signing key = the node's iroh secret key (Ed25519). The verifying key is the
node id embedded in the payload's ticket — no separate key material exists
(see [identity.md](identity.md)).

## Payload layout

Binary, all integers **big-endian**:

| offset | size | field | notes |
|---|---|---|---|
| 0 | 1 | `version` | `0x01`; reject anything else |
| 1 | 1 | `flags` | bit 0 = signed, bit 1 = single-use, bits 2–7 reserved (must be 0 on encode, ignored on decode) |
| 2 | 8 | `invite_id` | random nonce; lowercase-hex render is the display fingerprint |
| 10 | 4 | `issued_at` | unix seconds, u32 |
| 14 | 4 | `expires_at` | unix seconds, u32; `0` = never expires |
| 18 | 2 | `ticket_len` | = n |
| 20 | n | `ticket` | issuer `EndpointTicket` bytes (`iroh_tickets::Ticket::to_bytes`, postcard). Opaque to the codec |
| 20+n | 64 | `signature` | present iff flags bit 0; Ed25519 over bytes `[0, 20+n)` by the issuer node key |

Typical real tickets are ~90–150 bytes, so encoded invites run ~180–275 chars
unsigned, ~280–380 signed. `u32` timestamps roll over in 2106 — accepted.

## Encoding and link formats

Encoded form: `"azi" + base32(payload)` where base32 is RFC 4648, **no
padding, lowercase** (the same alphabet family iroh tickets use). Anything
that doesn't decode, or whose inner structure is inconsistent (truncated,
`ticket_len` overrun, missing signature when flags bit 0 is set), is rejected.

- `https://azula.app/i/<encoded>` — canonical share link (universal/app link)
- `azula://i?c=<encoded>` — custom-scheme fallback
- bare `azi…` string — pasteable into the connect box

Legacy forms `https://azula.app/s/<ticket>`, `/connect/<ticket>`, and
`azula://connect?code=<ticket>` keep parsing everywhere during the transition
(see below).

## Wire protocol

`Hello` — already the mandatory first frame on every ALPN — gains an optional
field:

```json
{"type":"hello","name":"<node id hex>","invite":"azi…"}
```

Kotlin: `Frame.Hello(name, invite: String? = null)` (network-api
`Protocol.kt`). Rust: `Hello { name, #[serde(default)] invite: Option<String> }`
(`proto.rs`). Old peers omit the field / ignore it; no version negotiation.

The redeemer sends the full encoded invite string in every `Hello` it dials
with, and keeps re-presenting it on auto-reconnect until the issuer has
accepted (after which it is a known peer and the invite is dropped).

## Verification (accept side)

A connecting peer is **known** if its node id matches an enabled conversation,
a saved peer entry, or the contacts list of previously accepted peers (CLI: a
registered device). Known peers connect exactly as before — no gate.

For a stranger, the acceptor reads the first frame (15 s timeout) and requires
`Hello.invite`. The invite is valid iff **all** of:

1. payload decodes and `version == 1`;
2. the embedded ticket's node id **is my own node id** (the invite was issued
   by me, addressed to me);
3. `invite_id` exists in my issued-invite store (⇒ not revoked);
4. `expires_at == 0` or `now < expires_at`;
5. if flags bit 0: the signature verifies against my node key;
6. if flags bit 1: the invite has not already been consumed.

App: a valid stranger becomes a **pending request** (persisted; stream held
open in memory; batched local notification) — no conversation exists until the
user accepts. Accept adds the peer to contacts, wires the stream (or waits for
the peer's auto-redial if it died), and marks single-use invites consumed.
Decline closes and forgets. CLI: headless — verification *is* acceptance (the
operator minted the invite); on success the device is registered as `azula
pair` would.

Invalid or missing invite ⇒ close the connection. Transition escape hatch: the
app setting `allowLegacyInbound` / CLI `--allow-legacy` (default **on** for
one release, then off) routes invite-less strangers into the pending inbox
flagged "unverified" instead of closing.

Redeeming never requires a profile: paste/scan/deep-link connects as a guest;
sharing a persona is an optional inline step, never blocking.

## Stores

- **App** (`InvitationsStore`, JSON blob per the `ProfileStore` pattern): one
  file `{ "issued": [IssuedInvite], "pending": [PendingInvite], "contacts":
  [nodeIdHex] }` with `IssuedInvite {id, createdAt, expiresAt, flags, label?,
  consumed}` and `PendingInvite {nodeId, inviteId?, receivedAt, peerCode,
  unverified}`.
- **CLI**: `~/.azula/invites.json` (same `IssuedInvite` shape; dir overridable
  like the registry). Minted by `azula invite [--expires 1h|24h|7d|never]
  [--sign] [--single-use] [--label …] [--bridge]`; listed by `azula invites`;
  revoked by `azula invite revoke <id>`. `serve`/`serve-mcp` mint a signed
  24 h invite for their startup pairing QR instead of printing the raw
  ticket. `azula invite` targets the `serve` identity by default and the
  bridge identity with `--bridge` — these are different persisted node keys
  (see [`mcp-bridge.md`](mcp-bridge.md#pairing-flow)), so an invite must be
  minted for whichever identity (`azula serve` vs. `serve-mcp`/`mcp`) is
  meant to accept it.

## Test vectors

Shared by the Kotlin (`link` module), Rust (`azula-cli/src/invite.rs`), and TS
(`azula-site`) test suites. The ticket field is 32 opaque ASCII bytes — **not**
a real ticket — so codec tests must not try to dial or parse it. The signing
key is RFC 8032 TEST 1 (test-only, never use for real identity):

```
seed        9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60
public key  d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a
ticket      "azula-test-endpoint-ticket-bytes" (ASCII)
            617a756c612d746573742d656e64706f696e742d7469636b65742d6279746573
invite_id   0123456789abcdef
issued_at   1767225600  (2026-01-01T00:00:00Z)
```

**V1 — unsigned, no expiry, multi-use** (`flags=0x00`, `expires_at=0`):

```
payload  01000123456789abcdef6955b900000000000020617a756c612d746573742d656e64
         706f696e742d7469636b65742d6279746573
encoded  aziaeaaci2fm6e2xtppnfk3saaaaaaaaabamf5hk3dbfv2gk43ufvsw4zdqn5uw45bnor
         uwg23foqwwe6lumvzq
```

**V2 — signed, single-use, expires issued_at+86400** (`flags=0x03`,
`expires_at=1767312000`; signature is Ed25519 over the pre-signature bytes,
deterministic per RFC 8032):

```
signed-input  01030123456789abcdef6955b90069570a800020617a756c612d746573742d65
              6e64706f696e742d7469636b65742d6279746573
signature     9eb8e484ee62f7dcd62a1ba6e8da24d8acbb978e70390684c55d60d93feb9a48
              c1dd6ca3f3da5d77ea5bbeffdc20d6c905fd0c10f093841665a4177db5994907
encoded       aziaebqci2fm6e2xtppnfk3sadjk4fiaabamf5hk3dbfv2gk43ufvsw4zdqn5uw4
              5bnoruwg23foqwwe6lumvzz5oheqtxgf5642yvbxjxi3isnrlf3s6hhaoigqtcv2
              ygzh7vzusgb3vwkh462lv36uw5677ocbvwjax6qyehqsocbmznec563lgkja4
```

Every suite must check: V1 and V2 decode to the fields above; V1 and V2
re-encode byte-identically; a version byte of `0x02` is rejected; a payload
truncated mid-ticket is rejected. Suites with Ed25519 available (Rust; Kotlin
via the real transport) must additionally verify V2's signature against the
public key above and reject it with the last signature byte XORed with `0x01`.

## Transition / compat

- Legacy `/s/` links parse forever for **outbound** dialing.
- Inbound invite-less strangers: `allowLegacyInbound` / `--allow-legacy`
  (default on for one release, requests land marked "unverified", then
  default off).
- Old ↔ new `Hello` is wire-compatible in both directions (missing/extra
  `invite` field tolerated). Already-paired peers are known by node id and
  unaffected everywhere.
- Mailbox, media, and terminal flows are untouched — the gate runs at
  connection accept, before any wiring.

## Future work (out of scope)

- Worker-side full signature verification on the invite page (needs node-id
  extraction from the postcard ticket in TS).
- QR alphanumeric-mode optimization (uppercase base32) for smaller QR codes.
- Gating the media ALPN on known peers.
- Remote push (FCM/APNs) for offline invitation delivery.
