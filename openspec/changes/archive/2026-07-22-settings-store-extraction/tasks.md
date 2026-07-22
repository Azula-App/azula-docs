## 1. Build the store

- [x] 1.1 Design the `SettingsStore` persisted blob shape, following the
      `ProfileStore`-style JSON-blob pattern. Landed as `AppSettings`
      (`persistence-api`), one blob shared with the setup-gate flags.
- [x] 1.2 Implement `SettingsStore` (read/write, default values) — real
      implementations on jvm, android and ios.
- [x] 1.3 Unit-test `SettingsStore` in isolation (`SettingsServiceTest`).

## 2. Migrate `terminalSmartInput`

- [x] 2.1 Move `terminalSmartInput` from `ProfileBook` to `SettingsStore`.
      The live value is now owned by `SettingsService`.
- [x] 2.2 Write a one-time migration that copies an existing install's value
      out of the personas blob into the new store on first launch
      (`SettingsService.load(legacyTerminalSmartInput)`; the branch only runs
      while the new store has never been written).
- [ ] 2.3 Remove the `terminalSmartInput` field from `ProfileBook`.
      **Deliberately deferred, not forgotten.** The field is the migration
      source, and `PersonaService.save()` deliberately writes the frozen legacy
      value back so an older app version installed over this one still finds
      its setting. Removing it now would strand any install upgrading from a
      pre-`SettingsStore` build that skips the release carrying the migration.
      Safe to remove once no pre-`SettingsStore` installs remain in the field —
      the same release gate as `invitations-legacy-sunset` task 1.3.

## 3. Verify

- [x] 3.1 Confirm existing terminal smart-input tests still pass against the
      new store.
- [x] 3.2 Confirm upgrade path (old `ProfileBook` value present) migrates
      correctly (`migratesTheLegacyProfileBookValueWhenTheSettingsStoreHasNeverBeenWritten`,
      `settingsStoreValueWinsOverAStaleLegacyProfileBookValue`).
