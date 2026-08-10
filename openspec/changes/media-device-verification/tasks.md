## 0. Rig notes (2026-08-09)

Two things that cost time before anyone repeats this:

- **The `-mock` apps seed no media.** — **Fixed 2026-08-09.** `MockSeed` now
  carries a received image (Tavi) and a received audio note (Nori), with bodies
  *generated at runtime* by `MockMedia.kt` (hand-rolled PNG + WAV encoders, no
  binary committed) and served from `InMemoryBlobStore`, which `buildMockState`
  now seeds via `mockSeedBlobs()`.

  **The trap, if you touch these:** the fixtures must be **blob-backed**, not
  inline `bytesB64`. `Chat.kt`'s `AttachmentView` routes
  `blobId == null && bytes != null` to `LegacyAttachmentView`, which draws the
  picture but attaches **no tap handler** — so an inline fixture renders
  perfectly and silently cannot open the viewer. Cost an hour to spot; the
  constant `TEST_CARD_BLOB_ID` carries the warning.
- **iOS device installs need Developer Mode.** A dev build now signs cleanly —
  `xcodebuild -allowProvisioningUpdates` mints the Apple Development cert and
  both profiles (app + AzulaShare) against team `EB8N37743E`, App Group
  entitlement included. Install then fails with `CoreDeviceError 10005` until
  Developer Mode is enabled on the phone: Settings → Privacy & Security →
  Developer Mode → on → reboot → confirm. That is a physical, passcode-gated
  step; it cannot be done from the repo.

## 1. Image viewer gestures (device)

Exercised 2026-08-09 on the **iOS simulator** (iPhone 17 Pro / iOS 26.5) against
the new seeded image, using genuine multi-touch injection rather than a mouse.
These stay open as *device* tasks — simulator multi-touch is real multi-touch,
but it says nothing about how the gesture feels under a thumb, or about
momentum/rubber-banding on real hardware.

- [ ] 1.1 Pinch-zoom on a real device. — **Works on the simulator:** a
      two-finger spread took the test card from fit-to-width to roughly 6x; the
      16px grid scaled cleanly and stayed registered. Nothing to fix; the
      remaining question is purely how it feels on glass.
- [ ] 1.2 Pan while zoomed. — **Works on the simulator:** a drag up-and-left
      while zoomed moved the viewport right-and-down onto the two solid blocks,
      i.e. direct manipulation with the correct sign and no drift.
- [ ] 1.3 Double-tap to zoom. — **Not reachable from my tooling:** the simulator
      control exposes `tap` and continuous touch paths, but no double-tap, and
      two separate `tap` calls are far outside the ~300ms double-tap window
      because each is its own round trip. Needs a finger (or an XCUITest).
- [ ] 1.4 Swipe-between-images. — **Needs a second seeded image.** The pager is
      built from every `Complete` image *in that conversation*
      (`AzulaState.showFullscreenMedia`), and the seed currently has exactly
      one, so there is nothing to swipe to. Add a second attachment to Tavi's
      thread to make this testable.

## 2. Audio (device)

- [ ] 2.1 Inbound-audio waveform playback for a real received audio file
      (real peer, not the mock — mock has no filesystem `blobPath`).
      — **Confirmed still blocked, and now with the mechanism pinned down.**
      A blob-backed WAV attachment was seeded (Nori's thread) and it renders as
      a plain file row, `♪ voice-note.wav`, *not* a waveform player. The reason
      is exactly as this task always said: `rememberAudioPlayer(path: String)`
      wants "a BlobStore-native path", and `InMemoryBlobStore.pathFor()` returns
      `null` by construction ("in-memory: no filesystem path"). Seeding bytes
      cannot fix this — the mock would need a disk-backed BlobStore (a new
      expect/actual across jvm/android/ios, since `persistence-real`'s is not on
      `mock-support`'s dependency path). Still needs a real peer, or that store.

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

**Already done — this section was stale.** Verified 2026-08-09 from the
shipped pipeline rather than from the Apple portal UI; see the evidence
note under each item.

- [x] 6.1 Register App IDs for `app.azula` and `app.azula.AzulaShare` with
      the App Groups capability. — Evidence: the `ios` job of publish run
      [30863339787](https://github.com/Azula-App/azula-app/actions/runs/30863339787)
      (v0.0.7, 2026-08-03) archived and **manually** signed both bundle ids,
      building `AzulaShare.appex` alongside `ios-app.app`. Manual signing
      resolves a provisioning profile per bundle id, so both App IDs exist.
- [x] 6.2 Register `group.app.azula` and assign it to both App IDs. —
      Evidence: both targets sign with `CODE_SIGN_ENTITLEMENTS` files that
      declare `com.apple.security.application-groups` =
      `group.app.azula`. Codesign rejects an entitlement the profile does
      not grant, so the group is registered and on both App IDs.
- [x] 6.3 Create the App Store Connect app record + API key. — Evidence:
      API key `A993ZUS3VD` exists (`~/.appstoreconnect/private_keys/`,
      2026-07-18) and is mirrored into the repo secrets; the app record
      exists because v0.0.4 was accepted by TestFlight on 2026-07-20.
- [x] 6.4 Add the four Apple secrets to the repo (see
      `openspec/specs/release/design.md`). — Evidence: `gh secret list
      --repo Azula-App/azula-app` shows `APPLE_TEAM_ID`,
      `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_PRIVATE_KEY`
      (2026-07-18), plus the `APPLE_DIST_CERT_*` / `APPLE_PROFILE_*`
      pairs the manual-signing path also needs.
