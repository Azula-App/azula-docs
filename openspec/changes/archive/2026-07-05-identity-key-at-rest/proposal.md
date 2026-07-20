## Why

The secret key needed to be encrypted at rest on every platform. Android
already had this (Keystore-backed `EncryptedSharedPreferences`); iOS stored it
in plaintext `NSUserDefaults`; desktop stored it in a plaintext
`~/.azula/endpoint.key` file. Separately, a locked-Keychain-at-launch gap on
macOS could silently mint a new identity (changing the node id) instead of
failing loudly.

(Context: a 2026-07-02 cross-repo audit produced ten numbered findings across
the whole codebase — state-layer tests, ConnectService + bridge.rs splits, the
iroh-kmp accept-loop fix, store/endpoint/registry dedup, the demos sub-crate,
site tests + CI, lints. All ten were resolved the same day and are not
detailed further here; this archive entry covers only the identity-key-at-rest
work, which landed a few days later on 2026-07-05.)

## What Changed

- **iOS** moved secret-key storage from `NSUserDefaults` to the Keychain.
- **Desktop** moved secret-key storage from plaintext
  `~/.azula/endpoint.key` to the macOS login Keychain (service
  `app.azula.identity`, account `endpoint_key`, via the `security` CLI with a
  5 s timeout). Non-macOS desktop keeps the `FileSecretKeyStore`.
- Migration was made safe in both directions: `load()` reads the Keychain
  first, else reads any legacy plaintext file, writes it into the Keychain,
  reads it back to verify, and only then deletes the plaintext — never a
  window with no copy. `save()` writes the Keychain first and only falls back
  to a plaintext file if that fails.
- **Locked-Keychain-at-launch gap fixed.** `MacKeychainSecretKeyStore.load()`
  now distinguishes a clean miss (`errSecItemNotFound`, exit 44 → migrate a
  plaintext file or return null on a fresh install) from an access failure
  (login keychain locked / `security` error / timeout → use a still-present
  plaintext copy, else throw `KeychainUnavailableException`); `bind()`
  rethrows that exception rather than degrading to a fresh key. A
  temporarily-unreadable Keychain now fails loudly ("unlock the login
  keychain and relaunch") instead of silently minting a new identity and
  changing the node id.

## Verification

- Unit tests: round-trip / overwrite / migration / absent, plus 5 injected-
  `security` tests for the locked-Keychain gap (miss / migrate /
  unavailable-throws / unavailable-falls-back / timeout).
- An independent `security` CLI round-trip was run manually.
- Confirmed on the development machine: its real key was already
  Keychain-resident with no plaintext copy left behind.

See `openspec/specs/identity/design.md` (Security considerations) for the
current, normative description of this storage layer.
