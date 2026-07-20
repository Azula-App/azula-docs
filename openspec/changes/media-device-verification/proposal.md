## Why

The streamed-media feature (see `openspec/specs/media-transfer/design.md`)
and the unified chat-consolidation/media/share/image-viewer/names/
invite-notification work (Phases 0–7 of the consolidation plan) both compile
on all targets and are unit- and build-test-verified, including a real
`xcodebuild` of `ios-app` plus the `AzulaShare` extension. But a set of
surfaces can only be confirmed by a human on real hardware, and several of
those passes are still outstanding.

### Context: what's already verified on hardware

A physical Pixel 6 Pro pass confirmed the unified neon-glass chat (PEER and
LLM look identical, attach menu offers Photo/Video/Audio/File on every
conversation), the full-screen image viewer's open + tap/back dismiss, the OS
share-sheet → "Share to…" conversation-picker → composer-prefill flow, and
per-conversation local rename. A Pixel ↔ Android-emulator end-to-end test over
the real Iroh network then confirmed: pairing via mint-invite → redeem →
accept-review-sheet, a direct e2e-encrypted connection (`direct · 10–33ms ·
e2e`, holepunched not relayed), bidirectional text delivery, image transfer
rendered inline on the receiver, and Phase-2 auto-export of the received image
to `/sdcard/Pictures/Azula/` (byte-exact, ~1 min after transfer). No crashes on
either device. The iOS mock app builds/launches/renders on a fresh iOS 26.5
simulator. Also on the iOS 26.5 simulator (Maestro, `e2e/ios-media.yaml`):
attach menu, PHPicker presentation (after fixing two real runtime bugs — nil
deprecated `keyWindow` on scene-based apps, and presenting from Compose's
transient popup-host VC, see `PickerInterop.ios.kt`), delegate + temp-file byte
copy, image send, bubble render.

**iOS release prerequisite** (separate from the device passes below, but
blocking the iOS side of this work shipping for real users): the bundle ids
are the real `app.azula` + `app.azula.AzulaShare`, `DEVELOPMENT_TEAM` is the
real team id (`EB8N37743E`), export compliance is declared, and the pipeline
is wired (see `openspec/specs/release/design.md`). What remains is Apple-side
account setup that can't be done from the repo: App IDs for both bundle ids
with the App Groups capability, `group.app.azula` registered and assigned to
both, the App Store Connect app record + API key, and the four Apple secrets
on the repo. Simulator builds use ad-hoc signing and need none of it.

## What Changes

Run and confirm the still-outstanding on-device/human verification passes
(none of these change code by themselves — each either confirms existing
behavior or files a follow-up bug):

- Image viewer pinch-zoom / pan / double-tap / swipe-between-images (only
  open+dismiss has been driven so far — adb can't easily do multi-touch).
- Inbound-audio waveform playback for a real received audio file (the real-peer
  test exercised image transfer, not audio; the mock has no filesystem
  `blobPath`).
- Connection-request system notification firing + tap-routing (the in-app
  accept flow is verified, but the notification only posts when backgrounded,
  `!foreground()`, so the posted notification + tap wasn't exercised).
- AVPlayer video embedding on iOS (desktop video stays poster + system-player
  by design, not in scope here).
- HEIC/HEVC type identifiers from a real camera roll.
- Desktop visual polish pass.
- The whole iOS side on a device: Share Extension real flow, Photos/Files
  auto-export, `UNUserNotificationCenter`.

Not in scope: a future iroh-kmp `open_bi` sibling-stream FFI that would let
media fetches share the conversation's QUIC connection instead of dialing a
new one — noted as a future idea, not a task here.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — verification only; file follow-up changes if a pass surfaces a real
bug)

## Impact

- `azula-app` image viewer, audio attachment playback, connection-request
  notification path, iOS `AVPlayer` embed, HEIC/HEVC handling, desktop media
  visual polish.
- `ios-app` / `AzulaShare` extension on a real device.
- `e2e/ios-media.yaml`, `e2e/android.yaml` (Maestro) as the harnesses already
  in place for the passes that can be scripted; the rest require hands-on
  multi-touch / notification / Apple-account steps that can't be driven from
  the repo.
