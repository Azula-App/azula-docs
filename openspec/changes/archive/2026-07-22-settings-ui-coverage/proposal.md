## Why

`azula-app/shared/src/dev/azula/ui/Settings.kt` (personas, avatar upload,
recovery-phrase reveal/restore dialogs) is the most security-adjacent UI in the
app and has no unit or e2e coverage. The state-layer glue underneath it is now
tested (`mock-support/test/RecoveryPhraseRestoreTest.kt`), but the dialogs
themselves aren't. Separately, `e2e/ios.yaml` never exercises the connect flow,
a parity gap against `e2e/android.yaml`.

**Status note (reconcile at apply time):** since this item was originally
filed, `mock-support/test@jvm/SettingsE2eTest.kt` now exists. Parts of this
proposal may already be satisfied — re-check current coverage of
personas/avatar-upload/recovery-phrase-reveal/recovery-phrase-restore dialogs
against that file before scoping tasks, and drop anything already covered.

## What Changes

- Add Compose UI test coverage (JVM suite, per `openspec/specs/testing/`) for
  the `Settings.kt` dialogs: personas, avatar upload, recovery-phrase reveal,
  recovery-phrase restore.
- Add a `LocalFilePicker` test seam so the avatar-upload path is drivable at
  all. The platform pickers are native modals (`java.awt.FileDialog`,
  `UIDocumentPickerViewController`, the android activity-result contract), so
  a UI test that clicked "pick picture" would block on a real OS dialog —
  which is why this path had no coverage. `rememberFilePicker` now consults
  the seam and the `expect` moved to `rememberPlatformFilePicker`.
- ~~Add an iOS Maestro connect-flow case to `e2e/ios.yaml`~~ — dropped, the
  gap is already closed; see the Impact note below.
- Reconcile scope against `SettingsE2eTest.kt`, which did not exist when this
  item was first filed.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — this is test coverage, not a requirements change; no existing spec
under `openspec/specs/` currently describes Settings.kt behavior at the
requirement level)

## Impact

- `azula-app/shared/src/dev/azula/ui/Settings.kt`
- `azula-app/shared/src/dev/azula/ui/FilePicker.kt` and its three actuals
  (`src@jvm`, `src@android`, `src@ios`) — gains the `LocalFilePicker` seam;
  the `expect` is renamed to `rememberPlatformFilePicker`. Call sites keep
  using `rememberFilePicker` unchanged.
- `azula-app/mock-support/test@jvm/ComposeE2eSupport.kt` — `desktopE2eTest`
  takes an optional `filePicker` override.
- `azula-app/mock-support/test@jvm/SettingsE2eTest.kt` (existing — audited;
  4 tests before, 11 after)
- `azula-app/mock-support/test/RecoveryPhraseRestoreTest.kt` (existing state-layer
  coverage, out of scope)
- ~~`azula-app/e2e/ios.yaml`, `azula-app/e2e/android.yaml`~~ — **no longer in
  scope.** The parity gap this proposal described was closed by a later
  refactor: the connect steps live in `e2e/subflows/connect-peer.yaml`, and
  `e2e/ios-media.yaml` runs that same shared subflow as `e2e/android.yaml`.
  iOS connect coverage exists; `e2e/ios.yaml` intentionally stays a
  launch/terminal smoke.
