## Why

Every iOS task in `media-device-verification` and `terminal-ime-device-pass`
stalls at the same wall: **nothing in the current toolchain can inject a touch
into a physical iPhone.** This was established by direct check on 2026-08-09,
not by assumption:

- The agent-facing iOS Simulator control is simulator-only by design.
- **Maestro is also simulator-only for iOS.** Its own help says "on a local iOS
  Simulator", and `maestro list-devices` lists only simulators under iOS even
  with the iPhone paired and visible to `devicectl`. This is the one worth
  writing down — Maestro is the obvious thing to reach for, and it does not
  close this gap.
- macOS iPhone Mirroring can drive the phone with mouse and keyboard, but types
  via the *Mac* keyboard, bypassing the on-screen keyboard entirely — worse than
  useless for IME work, which is most of what these passes test.

Everything up to the touch works: a dev build signs with a real Apple
Development cert and both profiles (App Group entitlement intact), installs via
`devicectl`, and launches. Only the interaction is missing.

The Android side has no such gap — the physical Pixel is fully drivable over
`adb` (`input tap`, multi-point `input motionevent`, `exec-out screencap`), and
real Gboard gesture typing, the suggestion strip and autocorrect all genuinely
engage with synthetic touches. That asymmetry is why Android device passes
close and iOS ones do not.

**XCUITest is the one thing that does drive physical iPhones**, and it has
first-class support for exactly the gestures these tasks need:
`pinch(withScale:velocity:)`, `doubleTap()`, `swipeLeft()`, plus real text entry
through the on-screen keyboard. Standing this up once unblocks the current
device passes and every iOS device pass after them.

## What Changes

- Give `ios-app-mock` a device-provisionable bundle id. It is currently the bare
  string `ios-app-mock`, which is not reverse-DNS and will not provision for a
  device install — and the seeded media and terminal fixtures the passes need
  exist **only** in the mock. `app.azula.mock` mirrors the Android mock's
  `app.azula.mock` and sits under the existing App ID prefix.
- Add a UI test target to `ios-app/module.xcodeproj` and wire its provisioning.
- Write the gesture cases: pinch-zoom, pan-while-zoomed, double-tap-to-zoom and
  swipe-between-images against the seeded image; the terminal IME pass against
  the seeded fake-PTY terminal.
- Run them on a real device via
  `xcodebuild test -destination 'id=<device-udid>'`.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities

- `testing` — adds device-level UI automation for iOS as a supported way to
  satisfy a "(device)" verification task, alongside the existing `adb` route
  for Android.

## Impact

- `azula-app/ios-app/module.xcodeproj` — new test target; `manageXCodeProject`
  runs on every Amper build, so confirm it leaves an added target alone. It did
  not disturb the committed `project.pbxproj` across many builds on 2026-08-09,
  which is suggestive but not proof.
- `azula-app/ios-app-mock/module.xcodeproj` — bundle id change. Anything holding
  the old id (a simulator install, a local scheme) will see this as a different
  app.
- Apple Developer account — an XCUITest runner needs its own provisioning
  alongside the app's, and device registrations consume slots that cannot be
  freed until the membership year rolls over.
- Unblocks: `media-device-verification` §1 and parts of §4;
  `terminal-ime-device-pass` §2.
- Does **not** unblock: `media-device-verification` §2.1 (the audio waveform
  needs a disk-backed `BlobStore`, a separate problem — see that change's §0
  rig notes), nor anything requiring a real second peer.
