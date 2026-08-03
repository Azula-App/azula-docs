# azula identity + recovery-phrase backup

What "identity" means in azula, how the 24-word recovery phrase encodes it,
where the key lives per platform, and the export/restore flows. Companion to
[`architecture-di.md`](../architecture-di/design.md), [`iroh-kmp.md`](../iroh-kmp/design.md),
[`device-linking.md`](../device-linking/design.md), and
[`account-sync.md`](../account-sync/design.md) — the latter two cover the
certificate format and the event log a multi-device identity syncs over,
respectively; this page stays focused on what identity *is* and the
phrase/restore flows around it.

## What identity is

An azula identity **is** a root Ed25519 keypair — a 32-byte secret, held by
at least one device. Each *device* additionally holds its own iroh endpoint
keypair, used for transport exactly as before multi-device identity: the
endpoint id (hex-encoded pubkey) is what makes a device's "code"/ticket/QR stable
across relaunches — lose a device's endpoint key and that one device gets a new
unrelated endpoint id. Peers identify a *contact* by root public key once that
contact has presented a certified device (see [`invitations.md`](../invitations/design.md));
a device presents its membership in an identity via a **device certificate**
signed by the root key (see [`device-linking.md`](../device-linking/design.md)
for the certificate format, enrollment, and revocation). No account, no
server-side identity — the root secret alone is what "being" the identity
means.

A device's own endpoint key still **signs invitations**: an issued invite can
carry an Ed25519 signature by the *device's* endpoint key, verified against the
endpoint id embedded in the invite's ticket (see [`invitations.md`](../invitations/design.md)) —
mechanically unchanged, only its name changed (previously "the identity key,"
back when endpoint key and identity key were the same 32 bytes on every device,
because there was only one device). The root key signs exactly two things:
device certificates and revocation statements. No other payload is signed by
either key.

**Upgrade in place** is the mechanism that keeps this from being a breaking
change for anyone already using azula: on first launch after upgrading, a
device's existing endpoint secret **becomes** the root secret unchanged, and the
device keeps using that very same 32 bytes as its device key too — a
self-certificate where `device_pk == root_pk`
(`RootIdentityMigration.selfCertify` in `core`, computed again and durably
logged by `AccountSyncService.ensureSelfCertified` in `shared` once
`ConnectService.start()` binds). The recovery phrase, the endpoint id, and every
existing contact are unaffected — they were already keyed on this same 32
bytes, which now simply also plays the root role. Only a device joined via
**QR-link enrollment** ever holds a endpoint key distinct from the identity's
root key; see [`device-linking.md`](../device-linking/design.md#qr-link-vs-phrase-enrollment-two-different-authorities)
for what that device does and doesn't hold.

Personas (name/avatar/description, `Persona` in `Settings.kt`) are a
separate cosmetic layer shared per-conversation (`Frame.Profile`) — not the
identity, not covered by the recovery phrase, and not (yet) the same concept
as account-sync's `profile_update` log entry (see
[`account-sync.md`](../account-sync/design.md)), which syncs a name/description
across an identity's own devices — the two are not unified. `azula-cli`'s
long-lived commands (`serve`, `bridge`, `blackjack`) keep their own
persistent keypairs the same way but have no recovery-phrase UI — see
[CLI](#cli-persistence). A `link`-named CLI identity (`azula link`) is a
different case again: it is always a *device* of someone else's multi-device
identity, never a standalone identity of its own — see
[`device-linking.md`](../device-linking/design.md).

## The recovery phrase: BIP-39, 24 words

`azula-app/core/src/dev/azula/core/RecoveryPhrase.kt` encodes the raw 32-byte
**root secret** — never a device endpoint key — as a standard **BIP-39 24-word
English mnemonic** (the crypto-wallet standard) over `Bip39Wordlist.kt`'s
2048-word list — reusing an established format rather than inventing one.
Device endpoint keys have no mnemonic encoding of their own: a QR-linked device
holds no root secret at all, so its "reveal recovery phrase" entry point has
nothing to reveal, permanently — not a transient "not bound yet" state (see
"Export flow" below).

`encode`: 8-bit checksum = first byte of `SHA-256(key)` (`Sha256.kt`); 256 key
bits + 8 checksum bits = 264 bits, chunked into 24 × 11-bit indices into
`BIP39_WORDS`.

`decode`: reverses this and returns `null` unless there are exactly 24
known words *and* the trailing 8 bits match `SHA-256` of the recovered key —
a typo, truncated paste, or unrelated phrase is rejected instead of silently
becoming the new identity. Whitespace/case are normalized first, so a messy
paste still round-trips.

Verified against canonical BIP-39 vectors in
`azula-app/core/test/RecoveryPhraseTest.kt`: all-zero entropy →
`"abandon" × 23 + "art"`, all-`0xff` → `"zoo" × 23 + "vote"`, 50 round-trips,
and negative cases (bad checksum, unknown word, wrong count). Run via
`./check -m core` from `azula-app/`.

## Where the key lives per platform

`IrohTransport` (`network-api/.../IrohTransport.kt`) exposes a **endpoint-key**
seam (`secretKeyBytes(): ByteArray?` / `suspend fun importSecretKey(bytes)`,
persist + re-bind so `endpointId`/`myTicket()` reflect the restored key) and,
since multi-device identity, an independent **root-secret** seam
(`rootSecretBytes(): ByteArray?` / `fun importRootSecret(bytes)`, persist
only — the root secret never determines a device's endpoint id, so importing it
never re-binds transport by itself). Per the identity capability's
Per-Platform Key-at-Rest Storage requirement, "the root secret and endpoint key
SHALL be stored under distinct entries" — each `network-real` impl persists
the two as two separate entries in the same underlying store:

- **JVM desktop** — `network-real/src@jvmAndAndroid/.../IrohFfiTransport.kt`,
  `defaultDesktopKeyStore()`: on macOS both entries live in the login
  Keychain (`MacKeychainSecretKeyStore`, service `app.azula.identity`,
  accounts `endpoint_key`/`root_secret`), each falling back to a plaintext
  file (`~/.azula/endpoint.key`/`root.key`) if the Keychain is unavailable;
  other desktop OSes use the plaintext files directly (no dependency-free
  per-OS keystore CLI exists there). The endpoint entry keeps its pre-existing
  name so an existing install's endpoint key — and therefore its endpoint id — reads
  back unchanged across the upgrade; the root entry is new and starts
  absent, which is exactly the signal the upgrade-in-place migration reads
  to decide this device needs to adopt its endpoint secret as its root secret.
- **Android** — `android-app/src/AndroidSecretKeyStore.kt`:
  `EncryptedSharedPreferences` file `"azula_secret"`, two keys
  (`"endpoint_key"` for the endpoint entry, `"root_secret_key"` for the root
  entry), Base64, AES256_SIV/GCM via a Keystore master key; injected into
  `IrohConfig.keyStore` from `AzulaApplication.kt`. Self-heals a corrupt
  post-reinstall keyset (`AEADBadTagException`) by deleting and recreating
  the prefs — both entries together, since a keyset corrupt enough to lose
  one is corrupt enough to lose the other — rather than dropping into demo
  mode.
- **iOS** — `network-real/src@ios/.../IrohTransport.ios.kt`: both entries
  live in the platform Keychain (service `app.azula.identity`, accounts
  `endpoint_key`/`root_secret`), each with an `NSUserDefaults` fallback
  (`azula_iroh_secret_key`/`azula_root_secret_key`, hex strings) if the
  Keychain write fails. A pre-existing plaintext endpoint-key value migrates
  into the Keychain in place the first time it's read — verified by reading
  it back before the plaintext copy is deleted, so there is never a window
  with the key nowhere.

Both `bind()`/`importSecretKey()` (endpoint key) and `importRootSecret()` (root
secret) funnel through the same per-entry store, so a restore lands where a
normal bind/read finds it on the next launch. `-mock` apps (`FakeTransport`)
persist nothing for either entry — every launch is a throwaway identity with
no root secret at all.

## Export flow (Settings → Reveal recovery phrase)

`Settings.kt`'s `RevealPhraseDialog` + `ConnectService.exportRecoveryPhrase()`
(delegated via `AzulaState`):

1. Settings → BACKUP & RECOVERY → "Reveal recovery phrase" opens a two-step
   dialog — never shows the phrase on first paint.
2. Step 1 is warning-only: "Anyone who has them can take over your identity —
   only store them in a password manager, and never share them." Reveal/Cancel.
3. `exportRecoveryPhrase()` now reads `transport.rootSecretBytes()` (not the
   endpoint key) and encodes it. A `null` result is disambiguated into two
   distinct dialog states rather than one generic failure: if a endpoint id is
   already known but there's simply no root secret yet, the dialog reads
   "No recovery phrase on this device" — the **permanent** QR-linked case
   ("This device joined the identity via a QR link, so the recovery phrase
   was never stored here — it lives only on devices that were set up with it,
   or that restored it."); if no endpoint id is known yet either, it's the
   ordinary **transient** not-bound-yet case, "Your key isn't ready yet.
   Connect once so the endpoint comes online, then try again." Distinguishing
   the two matters because a QR-linked device will *never* satisfy the
   transient case by waiting — telling it to "connect and try again" would be
   permanently bad advice.
4. Step 2 (root-holding devices only) shows the 24 words plus "copy to
   clipboard" (transient "✓ copied" for 1.4s via `AzulaState.copied`/
   `markCopied()`).

The two-step warning-then-reveal requirement above applies to reveals
**outside** the initial setup flow — i.e. this Settings dialog, and any other
future reveal entry point. The `onboarding` capability's back-up step (see
[`onboarding.md`](../onboarding/design.md)) shows the same 24 words on the
same `exportRecoveryPhrase()` call, but directly, with no warning-only
interstitial first: the step is only reached immediately after the user has
just explicitly chosen "create a new identity" on the preceding fork screen,
and that choice already *is* the deliberate first step the warning exists to
force elsewhere. Stacking a second "are you sure" in front of a phrase the
user just asked to see would be pure friction, not a safety gain. Both
contexts share the same fallback for an unbound transport, though: setup's
back-up step shows a waiting state rather than a "not ready yet" dialog, but
neither ever fabricates or partially displays a phrase before the transport
has actually bound.

## Restore flow (Settings → Restore from a phrase)

Restore is no longer "replace this device's key in place" — it is
**enrollment**: submitting a valid phrase joins this device into the
identity the phrase encodes as a new (or additional) device, per the
`Restore Recovers the Identity Onto This Device` requirement. This subsumed
the in-flight `recovery-restore-ux` change's open questions about
restore-overwrite semantics; three of its decisions (tasks 3.5a–c) are
recorded below, since restoring a *different* identity onto a device that
already held one is still the one genuinely destructive path enrollment
didn't eliminate.

`Settings.kt`'s `RestorePhraseDialog` + `ConnectService.importRecoveryPhrase()`:

1. The dialog body reads "Paste your 24-word recovery phrase. This device
   joins that identity as another device — it keeps its own key. If this
   device already holds a different identity, you'll be asked to confirm
   before its root secret is replaced." Unlike the pre-enrollment flow, a
   valid paste does **not** always commit immediately — see step 2.
2. Before committing, the UI calls `AzulaState.isDifferentIdentityRestore(input)`
   (`ConnectService.isDifferentIdentityRestore`, comparing the phrase's
   decoded root secret against whatever root secret this device currently
   holds, if any — direct 32-byte equality, since that's exactly equivalent
   to comparing derived public keys without needing to derive one). Its
   three outcomes:
   - `null` — the phrase doesn't even decode; committing anyway just
     surfaces the ordinary inline "That isn't a valid recovery phrase."
     error, unchanged.
   - `false` — this device holds no root secret yet (fresh install, or a
     QR-linked device with nothing to discard), or the phrase decodes to
     the identity **already held** (re-entering your own phrase). Both are
     non-destructive: a single tap commits.
   - `true` — this device already holds a **different** identity's root
     secret, and committing would discard it. The UI interjects a second
     confirmation dialog ("Replace this device's identity?" — "This device
     already holds a different identity. Restoring this phrase discards its
     root secret — that can't be undone without that identity's own
     recovery phrase.") before calling `importRecoveryPhrase()` at all.
3. `RecoveryPhrase.decode(phrase)` returning `null` (bad checksum/unknown
   word/wrong count) leaves everything unchanged and shows the inline error
   — this check runs regardless of which path above was taken.
4. On a valid phrase, `importRecoveryPhrase()`:
   a. Persists the decoded root secret (`transport.importRootSecret`) —
      this **never** touches the device's own endpoint key or rebinds the
      transport just to adopt a root secret; the device keeps (or, on a
      fresh install, already minted at its first `bind()`) its own endpoint
      keypair regardless of which identity it now holds root authority for.
   b. Self-issues its own device certificate under the newly-held root and
      appends a `device_add` log entry for it
      (`AccountSyncService.ensureSelfCertified`).
   c. Only if this was a **different-identity** restore (3.5a's destructive
      path): clears this device's saved peer tickets (`PeerStore`) — the
      displaced identity's tickets mean nothing under the newly-adopted one
      — and calls `transport.rebind()` to "begin syncing" under the new
      identity. A **same-identity** restore (re-entering your own phrase)
      does neither: nothing about the held identity actually changed, so
      nothing observable should either, and the transport is never
      disrupted for what is, underneath, a no-op.
   A rebind failure degrades to offline exactly like a failed initial bind
   and does **not** fail the restore (the enrollment itself already
   committed locally) — matching the spec's "A failed transport re-bind
   SHALL NOT fail the restore."

### The three restore decisions (tasks 3.5a–c)

**3.5a — second confirmation only on the destructive path.** A second
confirmation guards discarding an already-held *different* identity's root
secret specifically, because that loss is irreversible without that
identity's own phrase — but a fresh install (nothing held) or re-entering
the identity's own phrase stays a single tap, since neither discards
anything. Gating the extra step on `isDifferentIdentityRestore` rather than
showing it unconditionally keeps the common case (a first restore, or
re-pasting the same phrase after a reinstall) frictionless while still
stopping the one action a user could regret.

**3.5b — the displaced root secret is discarded, not archived.**
`importRootSecret` simply overwrites the single root-secret entry; no
separate archive slot exists. This is possible without losing data because
of `account-sync`'s log-scoping fix (task 4.6): the displaced identity's
*logs* already survive untouched on disk, namespaced under their own root
public key, so no message history is lost — only the root secret itself
goes away, and only after the user explicitly confirmed a warning that says
exactly that. Archiving the secret instead was rejected: it would leave this
device holding standing root authority for an identity the user just
deliberately moved away from, doubling the impersonation blast radius of a
stolen or compromised device for no corresponding benefit — the phrase
itself (not a copy living on some other device) is the spec'd durable
backup (see "Recovery Phrase Security Properties" below). Anyone who still
needs the old identity recovers it exactly as they would on any other
device: with its own 24-word phrase.

**3.5c — `reconnectSaved()` is rescoped, not skipped, and only on the
destructive path.** Under enrollment semantics a same-identity restore keeps
its endpoint key, so its saved peer tickets stay valid and untouched — the
original `recovery-restore-ux` concern (that a restore's reconnect attempt
against old tickets is a dead end) simply doesn't arise there anymore, and
is documented as intentionally unchanged. It only arises on 3.5a's
different-identity path, where the displaced identity's tickets genuinely no
longer apply under the newly-adopted identity — there, `importRecoveryPhrase`
clears `PeerStore` before rebinding, so the post-rebind `reconnectSaved()`
(fired from `transport.onCameOnline`) has nothing stale to redial.

## Security considerations

- **The phrase is full control of the identity** — no PIN/passphrase layer.
  Anyone with the 24 words can enroll a device with full **root authority**:
  send and receive as the identity, and — unlike a stolen QR-linked device —
  also issue and revoke device certificates for it (see
  [`device-linking.md`](../device-linking/design.md)). This is a strictly
  larger blast radius than the pre-multi-device model's "take over this one
  device's endpoint id," not a smaller one: the phrase now grants authority over
  every device of the identity, present and future.
- **Does not expose message history by itself.** The phrase alone decodes
  only the root secret; message history, contacts, and read state reach a
  restored device only by syncing from the identity's other reachable
  devices afterward (see [`account-sync.md`](../account-sync/design.md)) — a
  phrase restored with no sibling device reachable recovers the identity
  with empty history until one comes online. Saved peer tickets (`PeerStore`)
  are also not covered by the phrase itself.
- **At rest:** Android encrypts both entries (Keystore-backed AES); iOS and
  JVM desktop now Keychain-back both entries too, each with a plaintext
  fallback (see "Where the key lives per platform" above) — filesystem,
  defaults, or an unlocked Keychain access on those platforms is equivalent
  to holding the phrase.
- **Checksum ≠ security boundary.** The 8-bit checksum catches transcription
  errors (1/256 chance a random wrong phrase passes), not tampering.

## Verifying changes here

- `azula-app/core/test/RecoveryPhraseTest.kt`, `DeviceCertTest.kt`, and
  `CrossLanguageVectorTest.kt` via `./check -m core`.
- Manual: reveal a phrase on one install, restore it into a second (or after
  clearing app data) → confirm the endpoint id/"your code" of *each* device stays
  its own, the two converge on one contact list via sync, and a peer with
  either device's ticket can still reach the identity.
- Platform-specific: Android uninstall/reinstall (exercise the
  `AEADBadTagException` self-heal, both entries), iOS relaunch (Keychain
  survives; a pre-upgrade `NSUserDefaults` value migrates in place on first
  read), desktop (`wc -c ~/.azula/endpoint.key`/`root.key` each read 32 on a
  non-mac fallback; on macOS both live in the login Keychain instead).

## CLI persistence

`azula-cli/src/identity.rs` — no encode/decode, no mnemonic, but the same
mechanism: each long-lived identity (`serve`, `bridge`, and the demos crate's
`blackjack`) persists its raw 32-byte key at
`~/.azula/<name>.key` (`serve.key`, `bridge.key`, `blackjack.key`) via
`load_or_create_secret(name)`. Falls back to an ephemeral in-memory key
(logged warning) if `$HOME` is unset or unwritable — connect code then changes
every run. A device enrolled via `azula link` is a different case: its
persisted endpoint key (`~/.azula/link.key`, identity name `"link"`) is a
*device* of someone else's multi-device identity, not a standalone identity
of its own — see [`device-linking.md`](../device-linking/design.md).
