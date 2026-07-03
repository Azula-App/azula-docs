# Tech-debt backlog

Ranked open items. (A 2026-07-02 cross-repo audit produced ten numbered
findings; all were resolved the same day — state-layer tests, ConnectService +
bridge.rs splits, the iroh-kmp accept-loop fix, store/endpoint/registry dedup,
the demos sub-crate, site tests + CI, lints. What remains below is the tail.)
Delete entries as they land.

## 1. Settings.kt has no UI test coverage

`azula-app/shared/src/dev/azula/ui/Settings.kt` (~400 lines: personas, avatar
upload, recovery-phrase reveal/restore dialogs) is the most security-adjacent
UI and has no unit or e2e coverage. The state-layer glue underneath it is now
tested (`mock-support/test/RecoveryPhraseRestoreTest.kt`), but the dialogs
themselves aren't. Also: `e2e/ios.yaml` never exercises the connect flow
(parity gap vs `e2e/android.yaml`).

## 2. Recovery-phrase restore UX questions (product decisions)

- Restore commits on a single tap after a valid paste — no second
  confirmation before the current identity is overwritten (it is not
  archived).
- On restore, `transport.onCameOnline` triggers `reconnectSaved()` against the
  *previous* identity's saved peer tickets — usually a dead end on a fresh
  device. Harmless but worth deciding intentionally.
See `identity.md` (Restore flow).

## 3. Identity key at rest is cleartext on iOS and desktop

Only Android encrypts the secret key (Keystore-backed
EncryptedSharedPreferences). iOS stores it in `NSUserDefaults` and desktop in
a plain file `~/.azula/endpoint.key`. Moving iOS to the Keychain (and desktop
to the OS keystore where available) would close the gap. See `identity.md`
(Security considerations).
