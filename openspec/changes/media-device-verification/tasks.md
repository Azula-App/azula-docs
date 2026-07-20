## 1. Image viewer gestures (device)

- [ ] 1.1 Pinch-zoom on a real device.
- [ ] 1.2 Pan while zoomed.
- [ ] 1.3 Double-tap to zoom.
- [ ] 1.4 Swipe-between-images.

## 2. Audio (device)

- [ ] 2.1 Inbound-audio waveform playback for a real received audio file
      (real peer, not the mock — mock has no filesystem `blobPath`).

## 3. Notifications (device)

- [ ] 3.1 Trigger a connection-request system notification while
      backgrounded (`!foreground()`).
- [ ] 3.2 Confirm tap-routing from the notification into the app.

## 4. iOS media surfaces (device)

- [ ] 4.1 AVPlayer video embedding on iOS.
- [ ] 4.2 HEIC/HEVC type identifiers from a real camera roll.
- [ ] 4.3 Share Extension real flow on device.
- [ ] 4.4 Photos/Files auto-export on device.
- [ ] 4.5 `UNUserNotificationCenter` behavior on device.

## 5. Desktop

- [ ] 5.1 Desktop visual polish pass (poster + system-player is by design;
      confirm the polish, not the architecture).

## 6. iOS release prerequisites (Apple-side, blocking real iOS ship)

- [ ] 6.1 Register App IDs for `app.azula` and `app.azula.AzulaShare` with
      the App Groups capability.
- [ ] 6.2 Register `group.app.azula` and assign it to both App IDs.
- [ ] 6.3 Create the App Store Connect app record + API key.
- [ ] 6.4 Add the four Apple secrets to the repo (see
      `openspec/specs/release/design.md`).
