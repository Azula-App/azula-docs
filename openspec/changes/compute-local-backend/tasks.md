Branch `compute-local-backend` (azula-cli) holds the prototype from the
2026-11-21 research. It implements `LocalBackend`, `serve --local`, and the
Linux grant verbs, with the worker spawned as root through `sudo -n`. Group 1
reworks it to the design's D3/D4 before anything ships. Groups 2–4 depend on
group 1. Group 5 depends on groups 1–4.

## 1. Local backend (azula-cli)

- [x] 1.1 Rebase `compute-local-backend` on main; keep `LocalBackend`, `run_broker<B>`, and the Linux build of the host verbs (`grant|grants|revoke`, `serve --local`). Verify with `cargo test --lib compute` on macOS and a native `cargo build --release` on aarch64 Linux.
  - 2026-11-22: landed on azula-cli main (merge e4ef3f1). 96 `compute` tests and the guest suites pass. Native aarch64 Linux run: the static musl build served `cloud.sh` from the Pixel's Terminal VM.
- [x] 1.2 `azula-guest` accepts a listener passed by systemd (`LISTEN_FDS`/`LISTEN_PID`, fd 3) as an alternative to `--unix`. It still runs unmodified when started with `--unix` or `--vsock-port`. Run as non-root, its file operations skip `fchown`. Verify with a guest integration test that passes a listening socket via `LISTEN_FDS`, and that test runs as a non-root user.
  - Done: `azula-guest --systemd-socket` (36055c9). Activation tests pass as non-root, including put/get. On the Pixel's Terminal VM, systemd started it on demand as `azula`.
- [x] 1.3 `LocalBackend` connects to the activated socket (`/run/azula/worker.sock` by default; `--worker-socket` overrides it) instead of spawning the worker. `start` waits for a ping (≤ 30 s). `stop` replies `unsupported`. `info` reports online CPUs, `MemTotal`, `image: "local"` and `network: "host"`. Verify with unit tests over a fake worker socket.
  - Done (729997e). The sudo spawn mode is removed, and Terminal mode connects to `/run/azula/worker.sock`. Verified on the Pixel: `cloud.sh` ALL PASS relay-only, and `vm stop` exits 125 `unsupported`.
- [x] 1.4 Confinement checks before bind (spec: Local Backend Confinement). Refuse a job user that is root, equals the broker's user, or is in `sudo`/`wheel`. Name the violation. Verify with unit tests that use injected passwd/group data.
  - Done. On the Pixel, `serve --local --run-as droid` was refused ("the job user `droid` is the broker's own user"). As the job user, `push` into `/home/droid` and `pull` of `~droid/.azula/compute/host.json` failed with EACCES; a job couldn't read `host.key` or list `/mnt/shared`; `sudo -n` failed.
- [x] 1.5 `azula compute local-setup` (root, idempotent):
  - creates the job user `azula` (no sudo, not in `users`), `/var/lib/azula-guest` (owned by `azula`) and `/run/azula`;
  - installs and enables `azula-guest.socket` (`SocketUser=<invoking user>`, `SocketMode=0600`), `azula-guest.service` (`User=azula`) and `azula-compute.service` (`User=<invoking user>`, `serve --local`);
  - prints the next step (`azula compute grant`).
  
  Verify by running it twice in a Debian 13 VM: the second run changes nothing.
  - Done. On the Pixel's Terminal VM: the first run installed and enabled the units; the second reported everything `unchanged`. `/run/azula` is `droid` 0700 (`ExecStartPre install -d`), and `worker.sock` is `droid` 0600. A broker restart (`systemctl restart azula-compute`) kept a detached job running, and `attach` replayed it in full.
- [x] 1.6 Linux error text: `vm create|delete|list` say "creating VMs requires Apple silicon macOS". `--allow-sleep` is rejected on Linux. `serve` without `--local` explains the local backend. Verify with CLI tests.
  - Done (729997e). Verified on the Pixel: `serve` without `--local` explains `local-setup`.
- [x] 1.7 Update `vm/BROKER.md` §9 and `vm/README.md` §2.7–2.8: in the local backend, file operations run as the job user. Update the `src/compute/mod.rs` doc comment.
  - Done (729997e).
- [ ] 1.8 `write_private_atomic` (`src/compute/grants.rs`) fsyncs the parent directory after `rename`, so a grant whose token was printed survives a crash. This is pre-existing on every host: on the Pixel, a VM killed about 1 s after `compute grant` left `grants.tmp<pid>` and no `grants.json`. Verify with a unit test that the directory fd is synced, and by re-running the kill scenario.
  - Implemented with a unit test (729997e). **Still open:** re-running the VM-kill scenario on hardware.
- [ ] 1.9 `azula-guest.service` sets `MemoryMax=` (default: VM memory minus 1 GiB), so job page cache can't push the Terminal VM's footprint into Android's low-memory killer. Verify on the Pixel: a full `azula-cli` build twice back-to-back at the documented memory size leaves the Terminal alive.
  - `MemoryMax` is implemented (2883M on the 4 GB Terminal VM). **Still open:** the back-to-back-build LMK check on the Pixel.

## 2. Release (azula-cli)

- [ ] 2.1 `release.yml` copies `azula-guest` (static aarch64 musl) into the `aarch64-unknown-linux-musl` archive. The npm linux-arm64 package carries it next to `azula`. Verify with `tar -tzf` on a dry-run artifact and `npm pack --dry-run`.
- [ ] 2.2 `find_guest_bin` on Linux checks `$AZULA_GUEST_BIN`, then `azula-guest` next to the executable, then `azula-guest.linux-aarch64` next to it, then `PATH`. Verify with a unit test using a temp dir.

## 3. Docs (azula-site, azula-docs)

- [ ] 3.1 azula.app `/docs/compute/android`: enable Developer options and the Linux development environment, then open the Terminal. Then, inside the Terminal:
  - download the release;
  - run `sudo ./azula compute local-setup`;
  - mint a grant.
  
  The page also covers setting Memory size to about 50% of RAM (the slider allows about 70%, and at that setting the low-memory killer took the Terminal down under build load) and Keep awake, keeping the phone on a charger, and what goes offline after a reboot. Verify with the `doc-examples` skill.
- [ ] 3.2 `/llms.txt` compute recipe: one line saying a host may be an Android phone and that the client flow is unchanged. Verify with the `doc-examples` skill.
- [ ] 3.3 On archive, fold this change's spec delta into `specs/remote-compute/spec.md`, and add an Android section to `specs/remote-compute/design.md` that links the findings page.

## 4. Verification on hardware

- [ ] 4.1 On the Pixel 10a's Terminal VM: run `local-setup`, mint a grant, and run `vm/e2e/cloud.sh` against it from a Claude Code cloud environment with the n0 relays allowlisted. Record the timings here.
  - 2026-11-22, **prototype** (root worker via `sudo`, broker under a hand-written systemd unit, 4 GB VM), from the `azula-cli` cloud environment (x86_64, TLS-intercepting proxy, relay-only): ALL PASS in 90 s once the `cloud.sh` SIGPIPE fix was applied. Doctor took 2.8 s (dial 199 ms, auth 166 ms, guest 432 ms). See the findings page. Re-run this on the reworked implementation before checking the box.
- [ ] 4.2 Confinement checks on the device:
  - a job can't read `~droid/.azula/compute/host.key` or list `/mnt/shared`;
  - `azula compute push` to `/home/droid/x` fails;
  - `vm stop` returns `unsupported`;
  - a broker restart (`systemctl restart azula-compute`) leaves a running job attachable.
- [ ] 4.3 Soak test: an unplugged, screen-off overnight run with Keep awake set to its longest option (1 day on the 10a's build). A job writes a heartbeat every minute. Record gaps, battery drop, and Android thermal status.

## Workflow follow-up

- Archive with `/opsx:archive` after group 4 passes, then delete branch `compute-local-backend`.
