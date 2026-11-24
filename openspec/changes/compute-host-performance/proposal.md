## Why

Sal had Codex audit the Android compute host (azula-app `aedf972`, azula-cli
`37a9d4d`). The parent session checked its main claims in source. Most are
small, avoidable costs on the path from a cloud session to a guest: an extra
readiness ping per request, a scalar SHA-256 over every transferred byte, an
unbounded stdin queue, a whole-file seed copy on every START. None had been
measured on a phone, and the audit's own numbers come from an x86 sandbox.

## What Changes

- Three items landed on azula-cli main on 2026-11-23, on Sal's choice ("Quick
  wins during the soak"), with unit tests and no phone measurement yet
  (`eebc013`): the guest hashes with `sha2`, a warm request pings the worker
  once, and unread stdin is bounded in memory.
- The rest are tasks below, each measured on the Pixel before and after. An
  item that doesn't measurably help is dropped, with its numbers.

## Capabilities

### Modified Capabilities
- `remote-compute`: the worker's handling of unread stdin.

## Impact

- azula-cli: `src/compute/` (broker, local backend, transfer client),
  `vm/guest` (jobs, SHA-256), `vm/avf-seed`.
- azula-app: `vmhost-real` (`Splice`, `Proxy`, `HostService`, `AvfVm`).
- Wait for `compute-android-app-host` 3.8 to land before touching
  `HostService.kt`, `AvfVm.kt` or `vm/avf-seed`.
- No phone work while an overnight soak runs, and never on `app.azula`.
