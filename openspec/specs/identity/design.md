# azula identity + recovery-phrase backup

What "identity" means in azula, how the 24-word recovery phrase encodes it,
where the key lives per platform, and the export/restore flows. Companion to
[`architecture-di.md`](../architecture-di/design.md) and [`iroh-kmp.md`](../iroh-kmp/design.md).

## What identity is

An azula identity **is** an iroh node keypair: a 32-byte `SecretKey`. The node
id (hex-encoded pubkey) is what makes a device's "code"/ticket/QR stable across
relaunches — lose the key, get a new unrelated node id. No account, no
server-side identity. The same key also **signs invitations**: an issued invite
can carry an Ed25519 signature by this node key, verified against the node id
embedded in the invite's ticket (see [`invitations.md`](../invitations/design.md)) — the
one place identity key material is used for signing rather than transport TLS. Personas (name/avatar/description, `Persona` in
`Settings.kt`) are a separate cosmetic layer shared per-conversation
(`Frame.Profile`) — not the identity, not covered by the recovery phrase.
`azula-cli`'s long-lived commands (`serve`, `bridge`, `blackjack`) keep their
own persistent keypairs the same way but have no recovery-phrase UI — see
[CLI](#cli-persistence).

## The recovery phrase: BIP-39, 24 words

`azula-app/core/src/dev/azula/core/RecoveryPhrase.kt` encodes the raw 32-byte
key as a standard **BIP-39 24-word English mnemonic** (the crypto-wallet
standard) over `Bip39Wordlist.kt`'s 2048-word list — reusing an established
format rather than inventing one.

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
`./kotlin check -m core` from `azula-app/`.

## Where the key lives per platform

`IrohTransport` (`network-api/.../IrohTransport.kt`) exposes
`secretKeyBytes(): ByteArray?` (export) and
`suspend fun importSecretKey(bytes: ByteArray)` (persist + re-bind so
`nodeId`/`myTicket()` reflect the restored key). Each `network-real` impl
persists the raw 32 bytes differently:

- **JVM desktop** — `network-real/src@jvmAndAndroid/.../IrohFfiTransport.kt`:
  plain file at `~/.azula/endpoint.key` (`FileSecretKeyStore`, the
  `IrohConfig.keyStore` default).
- **Android** — `android-app/src/AndroidSecretKeyStore.kt`:
  `EncryptedSharedPreferences` file `"azula_secret"`, key `"endpoint_key"`,
  Base64, AES256_SIV/GCM via a Keystore master key; injected into
  `IrohConfig.keyStore` from `AzulaApplication.kt`. Self-heals a corrupt
  post-reinstall keyset (`AEADBadTagException`) by deleting and recreating the
  prefs rather than dropping into demo mode.
- **iOS** — `network-real/src@ios/.../IrohTransport.ios.kt`: `NSUserDefaults`
  key `"azula_iroh_secret_key"`, hex-encoded string.

Both `bind()` and `importSecretKey()` funnel through the same store, so a
restore lands where a normal bind reads from next launch. `-mock` apps
(`FakeTransport`) persist nothing — every launch is a throwaway identity.

## Export flow (Settings → Reveal recovery phrase)

`Settings.kt`'s `RevealPhraseDialog` + `ConnectService.exportRecoveryPhrase()`
(`ConnectService.kt:112-113`, delegated via `AzulaState`):

1. Settings → BACKUP & RECOVERY → "Reveal recovery phrase" opens a two-step
   dialog — never shows the phrase on first paint.
2. Step 1 is warning-only: "Anyone who has them can take over your identity —
   only store them in a password manager, and never share them." Reveal/Cancel.
3. `exportRecoveryPhrase()` reads `transport.secretKeyBytes()` and encodes it;
   returns `null` if the transport hasn't bound yet, shown as "Your key isn't
   ready yet. Connect once so the node comes online, then try again."
4. Step 2 shows the 24 words plus "copy to clipboard" (transient "✓ copied"
   for 1.4s via `AzulaState.copied`/`markCopied()`).

## Restore flow (Settings → Restore from a phrase)

`Settings.kt`'s `RestorePhraseDialog` + `ConnectService.importRecoveryPhrase()`
(`ConnectService.kt:118-124`):

1. Row subtitle already reads "replace this device's identity"; dialog body
   repeats "This replaces the identity on this device — back up the current
   one first if you still need it." **No second confirm step** — a valid paste
   + Restore commits immediately.
2. `RecoveryPhrase.decode(phrase)` — `null` (bad checksum/unknown word/wrong
   count) leaves everything unchanged and shows "That isn't a valid recovery
   phrase." inline.
3. On success, `transport.importSecretKey(key)` persists the key and tears
   down + re-binds the endpoint in place — **no app restart**.
   `transport.onCameOnline` (wired in `ConnectService.start()`) fires as part
   of the rebind: refreshes `nodeId` and calls `reconnectSaved()` against
   *previously saved* peer tickets. Those tickets belonged to the old
   identity's peers, so on a fresh device this reconnect attempt is
   generally a no-op/dead end, not a real feature — worth confirming if it
   surprises anyone. `importRecoveryPhrase()` then re-reads `nodeId`/
   `myTicket()`.
4. The old key is overwritten, not archived — only recoverable if that phrase
   was itself backed up first.

## Security considerations

- **The phrase is full control of the identity** — no PIN/passphrase layer.
  Anyone with the 24 words can `importSecretKey` themselves and impersonate
  the device (dial as it, receive what peers send it, take its node id).
- **Does not expose message history.** Chat history lives in
  `persistence-api`/`-real`, keyed per conversation, independent of the
  transport identity; saved peer tickets (`PeerStore`) are also not covered.
- **At rest:** Android encrypts the key (Keystore-backed AES); iOS/desktop
  store it in cleartext (`NSUserDefaults` plist / plain file) — filesystem or
  defaults access on those platforms is equivalent to holding the phrase.
- **Checksum ≠ security boundary.** The 8-bit checksum catches transcription
  errors (1/256 chance a random wrong phrase passes), not tampering.

## Verifying changes here

- `azula-app/core/test/RecoveryPhraseTest.kt` via `./kotlin check -m core`.
- Manual: reveal a phrase on one install, restore it into a second (or after
  clearing app data) → confirm the node id/"your code" matches and a peer with
  the original ticket can still reach it.
- Platform-specific: Android uninstall/reinstall (exercise the
  `AEADBadTagException` self-heal), iOS relaunch (`NSUserDefaults` survives),
  desktop (`wc -c ~/.azula/endpoint.key` reads 32).

## CLI persistence

`azula-cli/src/identity.rs` — no encode/decode, no mnemonic, but the same
mechanism: each long-lived identity (`serve`, `bridge`, and the demos crate's
`blackjack`) persists its raw 32-byte key at
`~/.azula/<name>.key` (`serve.key`, `bridge.key`, `blackjack.key`) via
`load_or_create_secret(name)`. Falls back to an ephemeral in-memory key
(logged warning) if `$HOME` is unset or unwritable — connect code then changes
every run.
