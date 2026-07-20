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
- Add an iOS Maestro connect-flow case to `e2e/ios.yaml` so it parities
  `e2e/android.yaml`.
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
- `azula-app/mock-support/test@jvm/SettingsE2eTest.kt` (existing — audit before
  adding new tests)
- `azula-app/mock-support/test/RecoveryPhraseRestoreTest.kt` (existing state-layer
  coverage, out of scope)
- `azula-app/e2e/ios.yaml`, `azula-app/e2e/android.yaml`
