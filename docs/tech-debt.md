# Tech-debt backlog

Ranked open items. (A 2026-07-02 cross-repo audit produced ten numbered
findings; all were resolved the same day — state-layer tests, ConnectService +
bridge.rs splits, the iroh-kmp accept-loop fix, store/endpoint/registry dedup,
the demos sub-crate, site tests + CI, lints. What remains below is the tail.)
Delete entries as they land.

## 1. Settings.kt has no UI test coverage

`azula-app/shared/src/dev/azula/ui/Settings.kt` (personas, avatar
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

## 3. Media feature: unverified-on-device surfaces (2026-07-03)

The streamed-media feature (`media-transfer.md`) compiles on all targets and
its state layer is unit-tested. **Verified on the iOS 26.5 simulator**
(`e2e/ios-media.yaml`, Maestro): attach menu, PHPicker presentation (after
fixing two real runtime bugs: nil deprecated `keyWindow` on scene-based apps,
and presenting from Compose's transient popup-host VC — see
`PickerInterop.ios.kt`), delegate + temp-file byte copy, image send, bubble
render. Still needing a human/device pass: AVPlayer video embedding, the
inline audio bar, HEIC/HEVC type identifiers from a real camera roll,
fullscreen-overlay hit-testing vs player controls, and Android/desktop visual
polish. Desktop video stays poster + system-player by design. A future
iroh-kmp `open_bi` sibling-stream FFI would let media fetches share the
conversation's QUIC connection instead of dialing a new one.

## 4. Identity key at rest is cleartext on iOS and desktop

Only Android encrypts the secret key (Keystore-backed
EncryptedSharedPreferences). iOS stores it in `NSUserDefaults` and desktop in
a plain file `~/.azula/endpoint.key`. Moving iOS to the Keychain (and desktop
to the OS keystore where available) would close the gap. See `identity.md`
(Security considerations).

## 5. Invitations transition + follow-ups (2026-07-03)

The invite payload / connect-gate revamp shipped (see `invitations.md`). Open
tails:

- **Legacy inbound is still admitted.** `allowLegacyInbound` (app) and
  `--allow-legacy` (CLI `serve`/`serve-mcp`/`mcp`) default **on** for this one
  release so invite-less strangers land in the inbox marked "unverified"
  instead of being dropped. Flip both defaults **off** the release after, and
  delete the unverified path once no old clients remain.
- **Legacy `/s/` and `/connect/` links** still parse everywhere for outbound
  dialing. Keep for the transition, then remove the parse branches in
  `azula-cli/src/link.rs`, `azula-app/link/.../DeepLink.kt`, and the
  `azula-site` routes.
- **InviteReviewSheet has no Compose UI test.** The inbound accept/decline
  review path can't be driven by `FakeTransport` (it only simulates its fixed
  one-shot "mockterm" connection, not a generic inbound stranger). The gate
  logic is covered at the service layer (`StrangerGateTest`,
  `InviteServiceTest`); a UI test needs a fake transport that can emit an
  arbitrary inbound `IncomingConnection`.
- **`iroh-kmp` publish gotcha.** `./gradlew publishToMavenLocal` pulls in
  `cargoBuildLinuxArm64Debug`/`…X64`/`MinGWX64` even though no Linux/Windows
  KMP variant is published; on a Mac these fail (`aarch64-linux-gnu-gcc` etc.
  not installed) and fail the whole publish. Work around with
  `-x cargoBuildLinux… -x cargoBuildMinGW…`; the durable fix is to gate those
  cargo tasks off on hosts lacking the cross-toolchain in `build.gradle.kts`.
- **Worker-side signature verification** on the `/i/` invite page is not done
  (the page shows a "signed" badge from the flag but doesn't verify the
  Ed25519 signature — it would need to parse the node id out of the postcard
  ticket in TS). App and CLI both verify; the page is advisory only.

## 6. Terminal input/sessions follow-ups (2026-07-04)

The smart-input / selection / scrollback / persistent-sessions work shipped
(see `terminal.md`). Open tails:

- **Settings live in `ProfileBook`.** `terminalSmartInput` is persisted by
  piggybacking on the personas blob (there is no dedicated settings store).
  Fine at one flag; extract a real `SettingsStore` before more accumulate.
- **On-device IME pass pending.** Swipe typing, the suggestion strip,
  autocorrect fix-ups, selection gesture feel, and the alt-screen scroll
  *direction* (chosen to match `less`, one constant to flip) are verified by
  unit tests + builds but not yet by hands on a phone (device was
  fingerprint-locked). Only Pixel+Gboard and iOS-simulator paths were
  targeted; Samsung keyboard / SwiftKey / CJK IMEs are untested — the
  Smart/Raw input setting is the escape hatch.
- **Mock terminal feeds before resize.** `FakeTerminalStream` dumps its
  greeting at the emulator's default 80 cols before the window's resize
  lands (resize doesn't reflow), which corrupts any width-sensitive replayed
  content in mock-harness testing (bit one investigation already). Make the
  mock delay its greeting until after the first `Resize`, or feed a
  resize first.
- **Mouse reporting (`?1000/1002/1003/1006`)** is still parsed-and-ignored —
  claude's click/wheel interactions inside its TUI do nothing. Deferred from
  the rendering fix; the alt-screen swipe→arrows mapping covers scrolling
  only.
