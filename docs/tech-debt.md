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

## 3. Media feature: remaining unverified surfaces (2026-07-04)

The streamed-media feature (`media-transfer.md`) compiles on all targets and
its state layer is unit-tested. **Verified on the iOS 26.5 simulator**
(`e2e/ios-media.yaml`, Maestro): attach menu, PHPicker presentation (after
fixing two real runtime bugs: nil deprecated `keyWindow` on scene-based apps,
and presenting from Compose's transient popup-host VC — see
`PickerInterop.ios.kt`), delegate + temp-file byte copy, image send, bubble
render. **Verified on hardware**: a real Pixel↔Android-emulator pass over the
real Iroh network confirmed image send/receive, inline bubble render, the
fullscreen viewer's open/dismiss, and byte-exact auto-export to
`/sdcard/Pictures/Azula/` — see §8 for the full on-device rundown (don't
duplicate here). Still needing a human/device pass: AVPlayer video embedding
on iOS, inline-audio playback for a real received *audio* file, HEIC/HEVC type
identifiers from a real camera roll, the viewer's pinch-zoom/pan/swipe (only
open+dismiss was driven — also tracked in §8), and desktop visual polish.
Desktop video stays poster + system-player by design. A future iroh-kmp
`open_bi` sibling-stream FFI would let media fetches share the conversation's
QUIC connection instead of dialing a new one.

## 4. Identity key at rest — encrypted everywhere (2026-07-05); one gap

Fixed: the secret key is now encrypted at rest on all platforms. Android
(Keystore-backed `EncryptedSharedPreferences`, unchanged); **iOS** moved from
`NSUserDefaults` to the Keychain; **desktop** moved from plaintext
`~/.azula/endpoint.key` to the macOS login Keychain (service
`app.azula.identity`, account `endpoint_key`, via the `security` CLI with a 5 s
timeout). Migration is safe: `load()` reads the Keychain first, else reads any
legacy plaintext file, writes it into the Keychain, reads it back to verify,
and only then deletes the plaintext — never a window with no copy; `save()`
writes the Keychain first and only falls back to a plaintext file if that
fails. Non-macOS desktop keeps the `FileSecretKeyStore`. Verified: unit tests
(round-trip/overwrite/migration/absent) + an independent `security` round-trip;
this machine's real key is already Keychain-resident with no plaintext left.
See `identity.md` (Security considerations).

Locked-Keychain-at-launch gap — **fixed (2026-07-05).**
`MacKeychainSecretKeyStore.load()` now distinguishes a clean miss
(`errSecItemNotFound`, exit 44 → migrate a plaintext file or return null on a
fresh install) from an access failure (login keychain locked / `security`
error / timeout → use a still-present plaintext copy, else throw
`KeychainUnavailableException`); `bind()` rethrows that exception rather than
degrading to a fresh key. So a temporarily-unreadable Keychain now fails loudly
("unlock the login keychain and relaunch") instead of silently minting a new
identity and changing the node id. Covered by 5 injected-`security` tests
(miss / migrate / unavailable-throws / unavailable-falls-back / timeout).

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
- **`iroh-kmp` publish gotcha — fixed (2026-07-04).** `./gradlew
  publishToMavenLocal` used to pull in `cargoBuildLinuxArm64Debug`/`…X64`/
  `MinGWX64` even though no Linux/Windows KMP variant is published, failing
  the whole publish on a Mac. `iroh-kmp/build.gradle.kts` now disables those
  `cargoBuild*` tasks outside their native host (`enabled =
  GobleyHost.Platform.Linux.isCurrent` / `…Windows.isCurrent`, next to the
  existing iOS host gate), so `-x cargoBuildLinux… -x cargoBuildMinGW…` is no
  longer needed. Verified at the config/task level (the six tasks now report
  `SKIPPED` with no cargo invocation, and `publishToMavenLocal --dry-run`
  configures cleanly); a full `publishToMavenLocal` (recompiles the crate for
  every Apple/Android target) wasn't run in this session — heavy, and not
  needed to confirm the gating.
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

## 7. Headless test-harness flakes (`./kotlin check -m mock-support`) (2026-07-04)

Two known-flaky conditions surface when running the `mock-support` gate in a
headless/CI-like environment. **Neither is a code failure** — treat the gate as
green on build success + `0 tests failed`; only new `[ FAILED ]` test lines or
compile errors are real.

- **iOS simulator instability.** The `IOS_SIMULATOR_ARM64` test target
  intermittently makes the process exit non-zero *after* all native tests report
  `[ PASSED ]` — seen as both `exit code 149` (simulator teardown, SIGTTOU-class)
  and `Simulator boot timeout` (the sim never boots). Gets worse when two builds
  hit the simulator at once (e.g. a background verify plus the Stop-hook's queued
  check). The native unit tests themselves pass; it's the sim runner/teardown.
- **`DesktopAppE2eTest` Compose-UI timing flakes.** Cases like
  `clickingTheTerminalRowInTheSharedListOpensItsChat` and
  `inboundOfferAutoDownloadsToComplete` throw `ComposeTimeoutException` (a 5000 ms
  `waitUntil`) under load and pass on a clean re-run. Timing-sensitive, not
  logic bugs. Re-confirmed 2026-07-10: these two still flake, now on 20–30 s
  waits, and they do so **on a pristine baseline worktree** (1 failure in 5 runs
  with no changes applied) — so when they fail while you're reviewing a diff,
  check the baseline before assuming your change caused it. The failure signature
  to look for is a bare `ComposeTimeoutException`; a *different* signature (e.g.
  "Expected exactly '1' node but found '2'") is a real bug, not this flake.

Durable fixes would be: gate/serialize the iOS-sim test run (or make the wrapper
tolerate a post-`PASSED` non-zero sim exit), and raise/soften the E2E
`waitUntil` timeouts or reduce their load sensitivity.

## 8. Chat-consolidation / media / share work: on-device status (2026-07-04)

The unified-chat + media + share + image-viewer + names + invite-notification
work (Phases 0–7 of the consolidation plan) is build- and unit-test-verified on
all targets (incl. a real `xcodebuild` of `ios-app` + the new `AzulaShare`
extension).

**Verified on hardware.** A physical Pixel 6 Pro pass confirmed the unified
neon-glass chat (PEER and LLM look identical, attach menu offers
Photo/Video/Audio/File on every conv), the full-screen image viewer's open +
tap/back dismiss, the OS share-sheet → "Share to…" conversation-picker →
composer-prefill flow, and per-conversation local rename. A **Pixel ↔ Android
emulator end-to-end test over the real Iroh network** then confirmed: pairing
via mint-invite → redeem → accept-review-sheet, a **direct e2e-encrypted
connection** (`direct · 10–33ms · e2e`, holepunched not relayed), **bidirectional
text delivery**, **image transfer** rendered inline on the receiver, and
**Phase-2 auto-export** of the received image to `/sdcard/Pictures/Azula/`
(byte-exact, ~1 min after transfer). No crashes on either device. iOS mock app
builds/launches/renders on a fresh iOS 26.5 simulator.

**Still needs a pass** (couldn't be driven this session): the image viewer's
pinch-zoom / pan / double-tap / swipe-between-images (only open+dismiss was
driven — adb can't easily do multi-touch); inbound-**audio** waveform playback
for a *real received* file (the real-peer test exercised image transfer, not
audio; the mock has no filesystem `blobPath`); the connection-request **system
notification** firing + tap-routing (the *in-app* accept flow is verified, but
the notification only posts when backgrounded, `!foreground()`, so the posted
notification + tap wasn't exercised); and the whole iOS side on a device (Share
Extension real flow, Photos/Files auto-export, `UNUserNotificationCenter`).
**iOS release prerequisite:** the bundle ids are now the real `app.azula` +
`app.azula.AzulaShare` and the release pipeline is wired (see
[release.md](release.md)), but it still needs real Apple Developer provisioning:
App IDs for both bundle ids with the App Groups capability, `group.app.azula`
registered and assigned to both, and `DEVELOPMENT_TEAM` in
`ios-app/module.xcodeproj/project.pbxproj` replaced with the real team id (it is
the placeholder `TEAMID0000` today). Simulator builds use ad-hoc signing.

Note on a mock-only symptom that was fixed: audio/file attachments showed a
spurious "blob missing" Failed/retry in `-mock` builds because
`InMemoryBlobStore.pathFor` is always null and `AudioAttachmentView` treated a
null path on a `Complete` attachment as a failure (and its retry re-fetched an
already-complete blob). Fixed to render a static "no player" chip and to
early-return `startFetch` when already `Complete`; real `FileBlobStore` paths
are non-null for complete attachments, so real users were unaffected.
