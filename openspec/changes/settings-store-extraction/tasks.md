## 1. Build the store

- [ ] 1.1 Design the `SettingsStore` persisted blob shape, following the
      `ProfileStore`-style JSON-blob pattern.
- [ ] 1.2 Implement `SettingsStore` (read/write, default values).
- [ ] 1.3 Unit-test `SettingsStore` in isolation.

## 2. Migrate `terminalSmartInput`

- [ ] 2.1 Move `terminalSmartInput` from `ProfileBook` to `SettingsStore`.
- [ ] 2.2 Write a one-time migration that copies an existing install's value
      out of the personas blob into the new store on first launch.
- [ ] 2.3 Remove the `terminalSmartInput` field from `ProfileBook`.

## 3. Verify

- [ ] 3.1 Confirm existing terminal smart-input tests still pass against the
      new store.
- [ ] 3.2 Confirm upgrade path (old `ProfileBook` value present) migrates
      correctly.
