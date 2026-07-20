## ADDED Requirements

### Requirement: Media viewer gestures and playback SHALL be verified on real hardware

The full-screen image viewer's pinch-zoom/pan/double-tap/swipe-between-images, inbound-audio waveform playback for a real received file, AVPlayer video embedding on iOS, and HEIC/HEVC handling from a real camera roll SHALL be confirmed on real hardware, not just unit/build coverage or a simulator — automated/simulator coverage has previously missed real-device-only bugs in this feature area (see `openspec/specs/testing/design.md`, "Why both Compose UI tests AND Maestro").

#### Scenario: Image viewer gestures are driven on a physical device

- **WHEN** a tester drives the full-screen image viewer on a real phone
- **THEN** pinch-zoom, pan while zoomed, double-tap-to-zoom, and
  swipe-between-images all behave correctly (not just open+dismiss, which
  automation can already drive)

#### Scenario: Inbound audio plays back from a real received file

- **WHEN** a real peer sends an audio attachment over the real Iroh network
- **THEN** the waveform renders and playback works on the receiving device

### Requirement: The connection-request system notification SHALL be verified end to end

The connection-request system notification SHALL be confirmed to post while backgrounded and to route into the correct in-app review screen when tapped — only the in-app accept flow has been verified so far.

#### Scenario: Notification posts and tap routes correctly

- **WHEN** the app is backgrounded (`!foreground()`) and a connection request
  arrives
- **THEN** a system notification posts, and tapping it routes into the
  correct in-app review screen
