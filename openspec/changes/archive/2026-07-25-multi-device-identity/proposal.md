# Multi-Device Identity Proposal

## Why

An azula identity today is exactly one iroh endpoint keypair, so a person *is* a
single device: restoring the recovery phrase on a second device overwrites and
disconnects the first, message history is trapped on the device that received
it, and nothing can receive messages while a phone is off. Sal wants one
identity that spans phone, laptop, and an always-online server endpoint, where any
device can send and receive as "me" and peers see a single stable contact.

Research (iroh 1.0 ecosystem, Signal/Matrix/Jami prior art, p2panda's
iroh-based log-sync) converged on a well-trodden, simple shape: a root
identity key that signs per-device certificates, plus a signed append-only
event log replicated between the identity's own devices with per-device
cursors. iroh-gossip and CRDT libraries were evaluated and rejected for the
core: gossip has no offline retention (fit only for presence/nudges later),
and CRDT libraries are heavyweight for what is an append-and-replay problem
with a Kotlin-Multiplatform binding gap besides.

## What Changes

- **BREAKING (concept):** Identity becomes a root Ed25519 keypair distinct
  from any endpoint key. The 24-word recovery phrase encodes the *root* key.
  Peers identify a contact by root public key, not endpoint id. Wire-compat
  fallbacks keep old peers working.
- Each device keeps its own iroh endpoint keypair and holds a **device
  certificate** — `{device_pubkey, name, roles, issued_at, expires_at}`
  signed by the root key. New capability `device-linking` covers issuing,
  presenting, verifying, and revoking these certificates, and the
  enrollment flow for linking a new device.
- New capability `account-sync`: a per-identity signed, hash-chained
  append-only event log (messages sent/received, read receipts, contact
  add/remove, device add/revoke, profile updates) replicated between the
  identity's own devices over a new `azula/sync/0` ALPN with per-device
  cursors. A device with the `mailbox` role (typically the always-online
  azula-cli endpoint) stores the canonical log, accepts inbound peer messages
  while other devices are offline, and fans out on reconnect.
- `invitations` is modified: the known-peer gate and invite verification
  become root-identity-aware (a device is known if its certificate chains to
  a known root key), and `Hello` gains an optional device-certificate field.
- `identity` is modified: root-key definition, phrase semantics, restore
  becomes "recover the identity" rather than "replace this device's key",
  and device-scoped endpoint keys become an implementation layer below identity.
- azula-cli gains the mailbox/home role as a mode of its long-lived daemon
  (building on the existing bridge mailbox store-and-forward precedent).
- **Out of scope (future extensions, noted in design):** an auto-responder
  bot (it becomes trivially "one more device cert with a `bot` role" once
  this lands), presence via iroh-gossip, push notifications (FCM/APNs), and
  group conversations.

## Capabilities

### New Capabilities

- `device-linking`: the device-certificate layer — root key issues, devices
  present, peers verify, owners revoke; enrollment of a new device onto an
  existing identity; the device registry each device keeps.
- `account-sync`: the signed append-only event log, its wire protocol and
  cursor model, the mailbox role (store-and-forward + fan-out), and history
  bootstrap for newly linked devices.

### Modified Capabilities

- `identity`: identity is redefined as the root Ed25519 keypair; the recovery
  phrase encodes the root key; restore flow becomes identity recovery
  (mint a fresh device key, rejoin the device set) instead of in-place key
  replacement; per-platform storage now covers root-key material as well as
  the endpoint key.
- `invitations`: known-peer bypass and accept-side verification extend from
  endpoint-id matching to root-identity matching via device certificates;
  `Hello` carries an optional device certificate; invites minted by any of
  an identity's devices verify against the root key.

## Impact

- **azula-app**: `core` (`RecoveryPhrase.kt` re-targets the root key; new
  cert/event models), `network-api`/`network-real` (`Protocol.kt` `Hello`
  field, new sync ALPN + protocol, `ConnectService` known-peer logic),
  `persistence-api`/`persistence-real` (event-log store; `MessageStore`
  becomes a projection of the log), new `sync-api`/`sync-real` feature
  modules per the `architecture-di` module recipe.
- **azula-cli**: `proto.rs` (`Hello` field), `identity.rs` (root-key file +
  device cert), new mailbox/home daemon role reusing `mailbox.rs` patterns,
  `registry.rs` (device set), invite verification in `accept_gate.rs`.
- **iroh-kmp**: additive only — free functions for Ed25519 keypair
  generation/sign/verify over raw keys (root-key operations for KMP), per
  the SDK's purely-additive API constraint. Requires a Maven Central
  version bump to land in azula-app.
- **azula-site**: none (invite links unchanged).
- **In-flight change `recovery-restore-ux`**: its open decisions about
  restore-overwrite semantics are subsumed by the `identity` delta here;
  coordinate before implementing that change.
