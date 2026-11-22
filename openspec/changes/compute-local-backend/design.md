## Context

The research behind this change, with sources and measurements, is in
[`design-pages/android-pkvm-findings.md`](design-pages/android-pkvm-findings.md).
These are the constraints that shape the design. All were verified on a
stock, locked Pixel 10a running Android 17 (build CP3A.261005.005):

- **An app can't host VMs.**
  - The AVF Java API (`android.system.virtualmachine`) is a `@SystemApi`.
  - `framework-virtualization.jar` is on `BOOTCLASSPATH`, so hidden-API
    enforcement blocks it for sideloaded apps.
  - `MANAGE_VIRTUAL_MACHINE` is `signature|development|preinstalled` and
    `USE_CUSTOM_VIRTUAL_MACHINE` is `signature|development`. A normal app
    can only get them through `adb shell pm grant`.
- **Only the platform Terminal app's VM has a network.**
  - The Terminal app runs in the SELinux domain `vmlauncher_app`, which
    alone may use the `IVmTethering` service.
  - For every other caller, `vm check-feature-enabled network` reports the
    feature as disabled.
  - A VM booted from `adb shell` (`/apex/com.android.virt/bin/vm run`) does
    boot, with 8 vCPUs, but it gets no NIC.
  - The `shell` domain can't open `AF_VSOCK`, so nothing on the Android
    side can reach a VM it starts that way.
- **The Terminal VM is a usable Linux host.**
  - It is a non-protected pKVM VM running Debian 13 on kernel
    6.12-android16.
  - It has 8 vCPUs that mirror the host topology (1× Cortex-X4,
    3× A720, 4× A520), up to 5.2 GB of RAM, a 103 GB sparse disk,
    systemd, and NAT egress that reaches the n0 relays.
  - The released `azula-guest` 0.1.0 runs in it unchanged.
- **The broker is macOS-only today.**
  - `src/compute/host.rs` and `vmmgr.rs` are `cfg(target_os = "macos")`.
    The broker itself is generic over `VmBackend`
    (`names/state/info/start/stop/vsock_path/shutdown`), and it reaches a
    worker only through a Unix socket path.

## Goals / Non-Goals

**Goals:**
- A phone owner can turn the Linux Terminal VM into a compute host with one
  setup command. After that, a cloud session uses it with the same
  `azc1.` token flow as a Mac host.
- Nothing a client sends, including file transfer, gets more privilege
  than an unprivileged job user. The job user can't read the phone owner's
  data (`/mnt/shared`, `~droid`) or the broker's secrets.
- macOS behavior and the client stay unchanged.

**Non-Goals:**
- An Android app (azula-app) that hosts VMs through AVF. That is blocked
  today, as the Context explains; revisit if Google publishes the API.
- More than one VM per phone, and protected VMs.
- Termux / proot hosts.
- Starting the Terminal VM from outside the Terminal app.
- A thermal or battery policy in the broker.

## Decisions

### D1. The broker runs inside the Terminal VM, not on Android

All the Android integration lives in Google's Terminal app. azula runs
entirely inside Linux and dials the iroh relays outbound, like any Linux
host. Alternatives considered (details in the findings page):

- **(a) azula-app hosts VMs through AVF.** It needs adb `pm grant` of two
  development permissions, a device-wide hidden-API exemption, and Play
  policy forbids non-SDK APIs. Its VMs would have no network: jobs couldn't
  `apt`, `git clone` or `cargo fetch` unless the app proxied traffic over
  vsock.
- **(c) A shell-uid helper started over adb, or Shizuku-style through
  wireless debugging.** It can boot VMs, but it has no vsock and no NIC to
  reach them. The VMs also don't survive a reboot without adb.
- **(d) Termux.** It has no isolation boundary between jobs and the
  owner's app data, and the phantom-process killer stops long jobs.

### D2. A `local` backend that is the machine itself, enabled with `--local`

`LocalBackend` implements `VmBackend` for exactly one VM, named by
`--vm-name` (default `default`, which matches `default_vm_for` for `*`
grants). `vsock_path()` returns the worker's Unix socket, so the broker's
splice, grant checks, owner rewriting and timeout clamping are untouched.

On Linux, `compute serve` without `--local` keeps failing with an
explanation. A Linux machine that isn't itself a disposable or isolated VM
should not host jobs; `--local` is the operator saying it is. The welcome
frame and `VmInfo` report `image: "local"` and `network: "host"`, so
`vm status` shows the kind of host.

### D3. The worker runs as the job user, behind a socket only the broker can open

The prototype on branch `compute-local-backend` started
`sudo -n azula-guest --unix … --run-as azula` as root. That puts jobs under
`azula`, but README §2.7–2.8 file operations run as the worker. A root
worker would let any grant holder `push` over `~droid/.azula/compute/host.key`
or into `/etc/sudoers.d`. In a Mac VM that doesn't matter, because the job
user has sudo there anyway. Here it does matter.

So in the local backend the worker itself runs as the job user, and
everything a client causes runs with that user's privileges.

- **The socket.** The broker reaches the worker through systemd socket
  activation:
  - `azula-guest.socket` listens on `/run/azula/worker.sock`
    (`SocketUser=<broker user>`, `SocketMode=0600`).
  - `azula-guest.service` runs `User=azula`.
  - So only the broker's user can connect, and jobs can't impersonate
    the broker to the worker.
- **The worker change.** `azula-guest` learns to accept a listener from
  `LISTEN_FDS`/`LISTEN_PID`, about 20 lines. Started without root, it
  already runs jobs as itself (`identity::resolve` warns and keeps its own
  uid). Its file operations skip `fchown`.

Alternatives rejected:

- **Root worker with privilege-dropping file operations.** It is a larger
  guest change, and it keeps root in the client's path.
- **A setgid shared directory so the broker can reach a socket the job user
  creates.** That depends on group membership being exactly right. It also
  lets the job user replace the socket.
- **Running the broker as root.** That puts iroh-facing code at root and
  doesn't fix file operations.

### D4. systemd owns the worker and the broker; `vm stop` is unsupported

`azula compute local-setup` runs once, as root, and is idempotent. It:

- creates the job user `azula` (no sudo, not in `users`);
- installs `azula-guest.socket`, `azula-guest.service` and
  `azula-compute.service` (`User=<invoking user>`,
  `ExecStart=azula compute serve --local`);
- enables them;
- prints `azula compute grant` usage.

Because the worker doesn't belong to the broker, a broker restart leaves
jobs running and attachable. That is the robustness D11 of
`remote-compute-vm` wanted for Mac VMs.

- `vm start` waits for a ping, and socket activation starts the worker if
  needed.
- `vm stop` replies `unsupported`. Stopping the host from the cloud would
  kill the phone owner's own session.
- The Terminal VM boots only when the phone owner opens the Terminal app.
  After a phone reboot the host is offline until then.
- Recommend **Keep awake → Indefinite** and a charger. On the 10a, with
  defaults and adb attached, the VM kept running jobs with network through
  2.5 minutes of screen-off and 2 minutes of forced deep Doze. The
  Terminal's `VmService` is a `specialUse` foreground service.

### D5. The job user has no sudo

There is no root inside the sandbox, because the sandbox is the phone
owner's own Terminal VM. It is not a disposable VM. User-level toolchains
(rustup, uv, nvm, cargo) install into `~azula` without root. System
packages are the phone owner's to `apt install` as `droid`. The
local-backend guard (spec: Local Backend Confinement) refuses a job user
that is root, is the broker's user, or is in `sudo`/`wheel`.

### D6. Ship `azula-guest` in the linux-aarch64 archive and npm package

It is about 800 KB and static. The macOS archive keeps its
`azula-guest.linux-aarch64` copy for VM bundles. Linux lookup order:
`$AZULA_GUEST_BIN`, `azula-guest` next to the executable,
`azula-guest.linux-aarch64` next to it, then `PATH`.

## Risks / Trade-offs

- **[The broker and jobs share a kernel.]** A guest-kernel exploit by a job
  gets root in the Terminal VM. Root there can read the host key and the
  grant store, which holds hashes only. The blast radius is this host's
  identity and the owner's VM. Android stays protected by pKVM.
  → Mitigation: revoke and re-key (`~/.azula/compute/host.key` is per
  host). Document that this is weaker than the Mac's VM-per-workload
  boundary.
- **[The non-protected VM is visible to Android.]** Android, and anything
  with root on it, can read the VM's memory. → Accepted. It is the phone
  owner's own device.
- **[Google changes the Terminal]**, for example screen-off kills, a new
  network policy, or a new image layout. → azula depends on nothing
  Android-specific. `compute doctor` already reports an unreachable host or
  worker. The findings page records the build tested.
- **[Thermals and battery.]** Sustained all-core builds heat the phone,
  which throttles (numbers in the findings page) and drains the battery.
  → Document a charger and Keep awake. Worker caps (16 per grant, 64
  total) stay as they are.
- **[Memory.]** The Terminal lets the VM have about 70% of RAM (5.2 GB on
  the 10a). At that setting, after two full builds, lmkd killed the
  Terminal itself, at `oom_score_adj 0` with "fg TOP", and the VM died with
  it. Writes from the last seconds were lost: zero-length binaries and a
  missing `grants.json`. → Document about 50% of RAM. Bound job memory
  with `MemoryMax=` on `azula-guest.service`, so the guest's page cache
  can't grow the crosvm footprint unchecked; free-page reporting returns
  what the guest frees. Fsync the grant store's directory (tasks 1.8). A
  killed VM shows as `interrupted` jobs at the next worker start.
- **[Relay throughput.]** Bulk `push`/`pull` go through the n0 relays, as
  with Mac hosts, when no direct path forms. → Same as `remote-compute`.

## Migration Plan

The change is additive. Existing macOS hosts are unaffected. The prototype
branch `compute-local-backend` is the starting point:

1. Rework it to D3/D4: socket activation and a worker running as the job
   user.
2. Add `local-setup` and the confinement checks.
3. Ship it in the next minor CLI release.

Rollback is to stop advertising `--local`; nothing persists outside the
phone owner's VM.

## Open Questions

- Should the local backend also be offered on x86_64 Linux VMs (cloud VMs,
  ChromeOS Crostini)? The code is architecture-neutral. It would only need
  an x86_64 `azula-guest` in the release. This can be decided after the
  Android path ships.
