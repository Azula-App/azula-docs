## 1. Make the mock installable on a device

- [ ] 1.1 Change `ios-app-mock`'s `PRODUCT_BUNDLE_IDENTIFIER` from the bare
      `ios-app-mock` to `app.azula.mock`, matching `android-app-mock`'s
      `applicationId`. A bare, non-reverse-DNS id will not provision.
- [ ] 1.2 Register the App ID (or confirm `-allowProvisioningUpdates` mints it)
      and check the mock installs and launches on the device via `devicectl`.
- [ ] 1.3 Confirm the mock still builds and runs for the **simulator** after the
      rename — the simulator flow is what most day-to-day work uses.

## 2. Test target

- [ ] 2.1 Add a UI test target to `ios-app-mock/module.xcodeproj` (the mock, not
      the real app: the fixtures the gestures act on are the seeded ones).
- [ ] 2.2 Verify Amper's `manageXCodeProject` leaves the added target intact
      across a clean build. It did not disturb `project.pbxproj` over many
      builds on 2026-08-09, but that was without a hand-added target — this is
      the main structural risk in the change, so settle it early.
- [ ] 2.3 Provision the XCUITest runner for the device. It signs separately from
      the app under test, which is a common first-run stumble.

## 3. Gesture cases

Against the seeded fixtures added in `media-device-verification` (a received
image on Tavi's thread, a fake-PTY terminal). Note the gestures are on a Compose
canvas, not native controls, so these will address coordinates rather than
accessibility elements — prefer `XCUICoordinate` over element queries.

- [ ] 3.1 Pinch-zoom (`pinch(withScale:velocity:)`), asserting the view scaled.
- [ ] 3.2 Pan while zoomed, asserting the viewport moved in the drag direction.
- [ ] 3.3 Double-tap to zoom — the one gesture no current tooling can produce,
      since two separate tap calls fall outside the ~300ms window.
- [ ] 3.4 Swipe-between-images. **Needs a second seeded image**: the pager is
      built from every `Complete` image in that conversation
      (`AzulaState.showFullscreenMedia`), and the seed has exactly one, so
      there is currently nothing to swipe to.
- [ ] 3.5 Terminal IME pass — type into the terminal through the real on-screen
      keyboard and assert the echoed line, mirroring the Pixel/Gboard pass in
      `terminal-ime-device-pass` §1 so the two are directly comparable.

## 4. Close the loop

- [ ] 4.1 Run on a real device: `xcodebuild test -destination 'id=<udid>'`.
- [ ] 4.2 Tick the now-satisfied tasks in `media-device-verification` §1 / §4
      and `terminal-ime-device-pass` §2, citing this harness as the evidence.
- [ ] 4.3 Decide whether this runs in CI or stays a local-on-demand harness.
      CI would need a hosted device farm, which is a cost and vendor decision,
      not a technical one — say which, so the next person does not re-litigate.
- [ ] 4.4 Record in `specs/testing/design.md` how to run it, next to the
      existing Android/`adb` guidance.
