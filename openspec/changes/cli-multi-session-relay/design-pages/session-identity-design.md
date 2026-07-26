# Session identity — machine roots, per-session certs, scan-per-session pairing

Every azula process that talks to a device — an `azula mcp` server, an
`azula run`/`azula terminal` host, a scripted `--session` invocation — binds
its **own** iroh endpoint under its own keypair, never a shared long-lived
identity. What makes each of those processes trusted by a phone that has
already paired with the machine is a short-lived `azd…` certificate chaining
the session key back to a stable **machine** identity. This page documents
that model: `~/.azula/machine.key`'s adoption of `~/.azula/bridge.key`,
`FLAG_SESSION` certs, session key resolution/persistence, and the
scan-per-session path for environments with no machine key at all.

See `openspec/changes/cli-multi-session-relay/design.md` decisions D1-D3 for
the original design rationale; this page is the implementation-level detail
plus test pointers. The device-linking capability
([`device-linking/design.md`](../../../specs/device-linking/design.md)) owns the `azd…`
wire format itself; this page only documents the session-specific flag and
minting/verification functions layered on top of it.

## Where it lives

- `azula-cli/src/identity.rs` — machine identity: `load_or_create_secret`
  (the pre-existing per-name `~/.azula/<name>.key` mechanism `serve`/`link`/
  `blackjack` already used) plus the new `load_machine_secret_if_exists` /
  `load_or_create_machine_secret` pair.
- `azula-cli/src/certs.rs` — `FLAG_SESSION`, `DEFAULT_SESSION_EXPIRY`,
  `mint_session_cert`, `mint_self_certified_session`, `verify_session_cert`,
  on top of the pre-existing `DeviceCert` wire format.
- `azula-cli/src/session.rs` — `SessionKey::resolve`, the named-vs-ephemeral
  split, and the `Drop`-guard that deletes an ephemeral key file on clean
  exit.
- `azula-cli/src/core/mod.rs` (`establish`) — where every real entry point
  actually resolves a session key, reads the machine identity (read-only),
  mints the session cert, and binds the endpoint.
- `azula-cli/src/accept_gate.rs` — `CertGate`/`check_cert`/`gate_peer`, the
  Rust-side cert-aware admission gate used by the relay's chat ALPN (the
  *phone's* admission gate is Kotlin — see "Phone-side admission" below).

## Machine identity: `bridge.key` adopted as `machine.key`

`~/.azula/machine.key` is the stable per-machine root that signs session
certificates. On a machine that ran `azula serve-mcp`/`azula mcp` before
per-session keys existed, `~/.azula/bridge.key` already holds that identity
— `identity::load_machine_secret_if_exists()` adopts it **in place**: it
tries `machine.key` first, and only if that's absent does it read
`bridge.key`, copy its raw 32 bytes to a freshly written `machine.key`, and
leave `bridge.key` untouched on disk (nothing deletes it — anything still
reading it directly, if it exists, keeps working too). The node id — an
Ed25519 public key derived deterministically from the secret bytes — is
therefore byte-identical before and after adoption, so every pairing the
phone already has with this machine survives with zero re-pairing.

```rust
pub fn load_machine_secret_if_exists() -> Option<SecretKey> {
    // machine.key first; else adopt bridge.key (copy bytes, write
    // machine.key, leave bridge.key in place); else None.
}
pub fn load_or_create_machine_secret() -> SecretKey {
    // As above, but mints+persists a fresh machine.key when neither exists.
}
```

**Critical invariant, load-bearing for the headless story**: every
session-establishment code path — binding a session's own endpoint — calls
`load_machine_secret_if_exists`, **never** `load_or_create_machine_secret`.
The latter is reserved for explicit pairing-side flows: minting an invite
against the machine identity (`azula invite --bridge`), the `start_pairing`
tool/startup banner, or a future `azula pair` context. If a session merely
starting were allowed to *create* `machine.key`, a headless environment (a
fresh Claude Code web container, a CI runner) would silently acquire a
standing credential the instant any process ran — directly violating the
headless "no standing credential" requirement (see "Headless: scan-per-session"
below). `core::establish` reads it read-only:

```rust
let machine_secret = identity::load_machine_secret_if_exists();
let session_cert = match &machine_secret {
    Some(m) => certs::mint_session_cert(m, my_node_id, certs::DEFAULT_SESSION_EXPIRY),
    None => certs::mint_self_certified_session(&session.secret, certs::DEFAULT_SESSION_EXPIRY),
}.encode();
```

Tests: `identity.rs`'s `bridge_key_adopted_as_machine_key_preserves_node_id`
(byte-identical secret + public key before/after adoption, `bridge.key` left
untouched), `no_machine_or_bridge_key_session_path_creates_nothing` (the
read-only accessor writes nothing when neither file exists),
`load_or_create_machine_secret_creates_when_neither_exists` and
`..._adopts_bridge_key_when_present`.

## Session certificates: `FLAG_SESSION`

`certs::FLAG_SESSION = 0x04` is bit 2 of a `DeviceCert`'s `flags` byte (bit 0
is `FLAG_MAILBOX`, bit 1 `FLAG_BOT` — reserved). A session certificate is an
ordinary `azd…` `DeviceCert` with this flag set: `root_pk` is the machine
identity's public key, `device_pk` is the session's own key, `expires_at` is
`issued_at + 7 days` by default (`DEFAULT_SESSION_EXPIRY =
Duration::from_secs(7 * 24 * 60 * 60)`, overridable per session by passing a
different `Duration` to `mint_session_cert`).

```rust
pub const FLAG_SESSION: u8 = 0x04;
pub const DEFAULT_SESSION_EXPIRY: Duration = Duration::from_secs(7 * 24 * 60 * 60);

pub fn mint_session_cert(machine_secret: &SecretKey, session_pk: PublicKey, expires: Duration) -> DeviceCert;
pub fn mint_self_certified_session(session_secret: &SecretKey, expires: Duration) -> DeviceCert;
pub fn verify_session_cert(cert: &DeviceCert, expected_transport_peer: EndpointId) -> Result<()>;
```

`mint_self_certified_session` is exactly `mint_session_cert` called with the
session's own secret standing in for `machine_secret` — producing `root_pk
== device_pk == session_pk`, the same self-cert shape the app's
upgrade-in-place flow uses (see `device-linking/design.md`). The session's
display name lives in the app's `Profile` frame (sent separately, on the
transport connection itself), not in the cert — `mint_session_cert` always
leaves `DeviceCert.name` empty.

`verify_session_cert` checks everything that's self-contained to the cert
plus the connection: `DeviceCert::verify()` (structural validity, signature
against the cert's own `root_pk`, non-expiry), `FLAG_SESSION` set, and
`device_pk == expected_transport_peer`. It deliberately does **not** check
that `root_pk` belongs to an already-paired contact, or check revocation —
those need a registry/contact-set the `certs` module doesn't hold; callers
(the relay's LLM-ALPN admission path, and — on the phone — the Kotlin accept
gate) layer that check on top. See device-linking spec's "Session
Certificate Kind" requirement: a session cert "SHALL NOT enroll its holder
as a device of any multi-device identity" — it grants conversation access to
peers paired with the *machine*, nothing more (no sync participation, no log
authorship, no link-granting authority). A peer holding only a session cert
that attempts an `azula/sync/0` session gets rejected at `SyncHello`
verification, because the sync handler's own root-pk check has nothing to
do with the machine identity a session cert names.

Tests (`certs.rs`): `session_cert_mint_and_verify_happy_path`,
`session_cert_expired_is_rejected`,
`session_cert_missing_flag_session_is_rejected`,
`session_cert_transport_binding_mismatch_is_rejected`,
`self_certified_session_verifies`.

## Session key resolution and persistence (`session.rs`)

`SessionKey::resolve(name: Option<&str>)` is the single entry point every
real caller (`core::establish`, `cli::run_cmd`, `cli::terminal_cmd`) uses:

```text
explicit name (--session) or AZULA_SESSION (non-empty)?
  yes -> Named:     ~/.azula/sessions/<name>.key   (0600, created on first use, persists)
  no  -> Ephemeral: $TMPDIR/azula/sessions/mcp-<4 hex>.key (deleted on Drop)
```

- **Named** (`SessionKey::named`) — persistent key at
  `session::sessions_dir()` (`~/.azula/sessions`, or `AZULA_SESSIONS_DIR`
  override). Reused verbatim across invocations by
  `load_or_create_key_at`/`write_key_secure` (mode `0600` on unix via
  `restrict_permissions`). This is D2's mechanism for a one-shot script
  invoked dozens of times to land in the *same* phone conversation every
  time: `--session blackjack` (or `AZULA_SESSION=blackjack`) always resolves
  to the same key, hence the same node id, hence the same conversation (the
  app keys conversations by peer node id).
- **Ephemeral** (`SessionKey::ephemeral`) — a fresh `SecretKey::generate()`,
  display name `mcp-<4 lowercase hex>` (drawn from a freshly generated key's
  own CSPRNG bytes rather than pulling in a `rand` dependency — the same
  trick `invite.rs` and `cli::terminal_cmd::generate_name` use), persisted
  under `$TMPDIR/azula/sessions/` so a crash mid-session leaves a
  recoverable key file, but wrapped in an `EphemeralGuard` whose `Drop` impl
  deletes that file. **Gotcha, documented in the source**: `Drop` fires on
  an ordinary unwind/return out of scope, not on `std::process::exit` or a
  signal kill — a `kill -9`'d `azula mcp` process leaves its ephemeral key
  file behind. No signal-handling cleanup exists yet for this case (an open
  item for a later phase).

`SessionKey` carries `mode: SessionMode` (`Named`/`Ephemeral`), a
`display_name` (used in banners/logs and `azula status`'s session listing),
and `path()` (the on-disk key file path, if writing it succeeded).

### Per-entry-point session defaults (design.md D2)

| Entry point | Default (no `--session`/`AZULA_SESSION`) |
|---|---|
| `message send`/`recv`, `ui render`/`update`/`delete`, `watch`, `file send` | `Named("cli")` — via `cli::resolve_cli_session_name`, which resolves *before* `core::establish` is ever called, so these verbs never fall into `SessionKey::resolve`'s own `None` branch |
| `azula mcp` | `SessionKey::resolve(None)` directly — a fresh **ephemeral** key per process; `--session NAME` opts into a stable one |
| `azula run`, `azula terminal` (bare/handoff) | `SessionKey::resolve(None)` directly — fresh ephemeral per invocation |
| `azula terminal new --name N` | `SessionKey::resolve(Some(N))` — **named**, so the detached host's identity survives that process's own restarts (re-running `terminal new --name N` after a crash resumes the same session identity, not just the same PTY session id) |

Tests (`session.rs`): `named_session_key_persists_across_two_resolves`,
`distinct_named_sessions_get_distinct_keys`,
`env_var_selects_a_named_session_when_no_explicit_name`,
`no_name_and_no_env_is_ephemeral`,
`ephemeral_key_file_removed_on_guard_drop`,
`two_ephemeral_sessions_get_distinct_keys_and_names`. `cli/mod.rs`'s
`one_shot_verbs_default_to_the_shared_cli_session` /
`explicit_session_flag_wins_over_the_cli_default` pin the CLI-side default
independent of `session.rs` itself.

## Headless: scan-per-session, self-certified

When `load_machine_secret_if_exists()` returns `None` (no `machine.key`, no
`bridge.key` to adopt — the fresh-container/CI case), `core::establish` mints
a **self-certified** session cert (`mint_self_certified_session`) instead of
a machine-signed one, and every pairing-invite mint
(`core::mint_pairing_invite`) falls back to signing against the session's
own key rather than a machine identity it doesn't have:

```rust
pub(crate) async fn mint_pairing_invite(
    machine_secret: Option<&SecretKey>,
    session_ticket: &str,
    session_secret: &SecretKey,
) -> Option<String> {
    if let Some(machine_secret) = machine_secret {
        // bind a throwaway endpoint under the machine key, mint against it
    }
    mint_bridge_invite(session_ticket, session_secret)  // headless fallback
}
```

The process prints the resulting `https://azula.app/i/<azi…>` URL plus a
Unicode QR (`qr::render_qr`) — an ordinary signed invite, verified by the
phone through the pre-existing invite path (see
[`invitations/design.md`](../../../specs/invitations/design.md)), not the cert
auto-admit path. Nothing distinguishes a self-certified session's *invite*
from any other invite; what's new is only that the session cert itself has
`root_pk == device_pk`, so it can never chain to a *different* already-paired
machine and therefore can never auto-admit — the user always makes one
explicit approval per headless session, per the "scan-per-session, no
standing credential" design goal. Once approved, the invite mechanism
behaves exactly as it always has; the session cert riding along in
`Hello.cert` on the resulting connection is set but doesn't need to be
checked, since the invite already admitted the peer.

`azula run --handoff` and `azula terminal` on a headless host follow this
same path automatically — `start_handoff`/`host_session`
(`cli::run_cmd`/`cli::terminal_cmd`) call
`identity::load_machine_secret_if_exists()` themselves and pass it straight
into `core::mint_pairing_invite`, so a CI runner's failure handoff prints the
same connect-block invite/QR shape a fresh container's `azula mcp` would.

## Phone-side admission (Kotlin, azula-app)

The accept gate's cert-aware path (mirroring the Rust `accept_gate::CertGate`
used by the relay's chat ALPN) is implemented on the Kotlin side per the
session-identity spec's "Phone Auto-Accepts Certified Sessions as Flat
Conversations" requirement: five checks, all required —

1. `Hello.cert` decodes and self-verifies (signature by its own `root_pk`,
   unexpired).
2. It carries the session role flag (`FLAG_SESSION`, `0x04` — matching the
   Rust `certs::FLAG_SESSION` constant byte-for-byte, since a cert crosses
   the wire as opaque `azd…` bytes both languages decode independently).
3. `root_pk` equals the root/node key of an **already-paired machine
   contact**.
4. `device_pk` equals the connection's transport peer node id.
5. (implicit in #1) not revoked.

A cert failing any check falls through to the ordinary invite gate — never a
hard error that blocks the invite path (invitations spec: "a failure of any
SHALL fall through ... never to an error that blocks the invite path"). On
success, the app auto-creates a flat conversation (no threading — a
deliberate design.md Non-Goal), titled from the session's `Profile` frame
(the same `Frame::Profile{name, description}` a terminal host or bridge
session sends today), with no invite prompt at all.

*(The exact Kotlin file/class names implementing this gate, the `EventLog`
fold for the new `agent_in`/`agent_out` kinds this auto-admission feeds, and
the conversation bulk-archive-when-expired UX live in the azula-app worktree
and are cross-referenced from
[`relay-design.md`](relay-design.md#phone-side-agent-kinds-fold-into-a-flat-notified-conversation)
and [`account-sync/design.md`](../../../specs/account-sync/design.md), which own that
side of the wire in more depth than this page needs to duplicate.)*

## Revocation and exposure bounds

There is no per-session revocation mechanism in v1: a session cert's default
7-day expiry is the only exposure bound, and the phone can always
delete/block the resulting conversation manually to stop a specific session
from mattering to it going forward (though the cert itself remains valid
until it expires — deleting the conversation doesn't revoke the cert). What
*does* revoke every session at once is forgetting the **machine** contact:
once a machine's root key is no longer in the phone's known-contacts set, no
cert chaining to it passes check #3 above, so every session that machine has
ever minted — expired or not — stops being auto-admitted. This is a single
lever (revoke the machine) rather than fine-grained per-session revocation,
matching design.md's stated trade-off ("Revocation: none for individual
sessions in v1 — expiry bounds exposure").

## Tests

- `identity.rs` — machine-key adoption/creation/read-only-path tests (above).
- `certs.rs` — session-cert mint/verify/expiry/flag/transport-binding matrix
  (above), plus the pre-existing `DeviceCert`/`Revocation`/`LinkPayload`
  round-trip and cross-language-vector tests this module also owns.
- `session.rs` — named/ephemeral resolution and persistence (above).
- `core/mod.rs` — `establish` is exercised indirectly by every CLI-verb
  integration test that calls it; no dedicated `establish`-only test exists
  separately from those call sites.
- Run: `cargo test` from `azula-cli/` (`identity`, `certs`, `session`, `core`
  modules).
