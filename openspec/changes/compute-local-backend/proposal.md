## Why

`azula compute` (0.4.1) lets a Claude Code or Codex cloud session run jobs in
Linux VMs on an Apple silicon Mac. Sal asked whether an Android phone could
play the Mac's role, so a cloud session could borrow a phone's cores and RAM.
The research in
[`design-pages/android-pkvm-findings.md`](design-pages/android-pkvm-findings.md)
(2026-11-21, Pixel 10a on Android 17) found that:

- **An Android app can't host the VMs.** The AVF API is a `@SystemApi` on the
  bootclasspath. Its permissions need `adb pm grant`. VM networking is
  reserved to the platform Terminal app's SELinux domain.
- **A Linux VM already exists on every phone with Android's Linux Terminal.**
  It is a pKVM-isolated Debian 13 VM with 8 vCPUs, up to ~70% of RAM, a NAT
  network that reaches the iroh relays, and systemd.
- **The worker runs there unchanged.** The released `azula-guest` binary
  runs inside it as-is.
- **The broker can't yet.** `azula compute serve` refuses to run anywhere
  but macOS, because its only backend boots VMs.

## What Changes

- **A local backend for `azula compute serve`.** On Linux,
  `azula compute serve --local` serves exactly one "VM", which is the machine
  the broker runs on. It reaches an `azula-guest` worker that runs as the
  unprivileged job user behind a systemd-activated Unix socket only the
  broker can open, instead of booting a VM through `azula-vm`. Everything above
  the backend is unchanged: the iroh ALPN `azula/compute/1`, grants, tokens,
  durable jobs, file transfer, the client, and exit codes.
- **The local backend is opt-in, and only appropriate on an
  already-isolated machine.** Without `--local`, Linux `compute serve` still
  refuses to run. With it, jobs run as an unprivileged job user. The broker
  refuses to start if that user is root, is the broker's own user, or can
  use sudo.
- **Host verbs work on Linux in local mode:** `compute grant|grants|revoke`
  and `compute serve --local`. `vm create|delete|list` stay macOS-only, and
  `vm start|stop|status` reach the local "VM" through the broker as usual.
- **`azula compute local-setup`** (run once, as root) creates the job user
  and installs the systemd units.
- **`azula-guest` accepts a socket from systemd** (`LISTEN_FDS`). Started
  without root, its file operations skip `fchown`. Its behavior under
  `--unix` and `--vsock-port` is unchanged.
- **`write_private_atomic` fsyncs the grant store's directory**, so a
  printed token's grant survives a crash. This is a pre-existing bug found
  on the Pixel.
- **Release.** The `aarch64-unknown-linux-musl` archive gains `azula-guest`,
  so one download sets up a phone's Terminal VM. Today `azula-guest` ships
  only inside the macOS archive.
- **Docs.** A setup recipe for Android's Linux Terminal on azula.app
  (`/docs/compute/android`) and in `vm/BROKER.md`. It covers the job user,
  the systemd units, Keep awake, and how to mint the first grant.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `remote-compute`:
  - Hosting is no longer macOS-only; there is a Linux local backend with
    its own isolation rules.
  - Job placement, worker isolation, resource guards and VM lifecycle are
    restated for the case where the broker runs inside the sandbox.

## Impact

- **`azula-cli`:**
  - New `src/compute/local.rs` (Linux only).
  - `src/compute/host.rs` splits its grant and host-key logic from the
    macOS VM manager so that logic compiles on Linux.
  - `compute serve` gains `--local`, `--vm-name` and `--run-as`.
  - The release workflow copies `azula-guest` into the linux-aarch64
    archive.
  - A prototype is parked on branch `compute-local-backend`; see `tasks.md`.
- **`azula-site`:** a new `/docs/compute/android` page and a line in
  `/llms.txt`.
- **macOS hosts:** no behavior change.
- **Phone owners:** they need a device with Android's Linux Terminal (Pixel
  6 or later on Android 16+, and a growing list of others), and Developer
  options turned on. The Terminal VM must be running for the host to be
  reachable.
