Every phone measurement below needs the Pixel free, so it waits for the
overnight soak (compute-android-app-host 5.2) to be collected. Tests are on
azula-cli main at `eebc013`. One change at a time, paired A/B, 50 or more
observations for short-command p95, with revisions, guest kernel, temperature
and charging state recorded.

## 1. Landed 2026-11-23, not yet measured on a phone

- [x] 1.1 Guest SHA-256 through the `sha2` crate. Digests match the old code in the tests. In isolation on an Apple-silicon Mac: 211 to 2308 MiB/s.
- [x] 1.2 One worker ping per warm request (`VmBackend::probe`): 3 connections to 2 for a forwarded request, 2 to 1 for `guest_ping`.
- [x] 1.3 Unread stdin bounded at 4 MiB in memory, spooled after that. Guest tests: 24 MiB to a slow child in order; cancel and disconnect not stuck behind unread input.

## 2. Measure the landed items on the Pixel

- [ ] 2.1 Guest CPU-seconds per GiB for 1, 64 and 256 MiB pushes and pulls, and an interrupted transfer near 80%, before and after 1.1.
  - 2026-11-24, Pixel 10a (raw files in `.worktrees/measure-audit/`, not committed): in the VM, `sha2` hashes 1741 to 1748 MiB/s against 200 for the scalar code (3 runs; the VM's CPU has the ARMv8 SHA2 instructions). Direct pushes of 64 MiB ran about 12 MiB/s with about 1.2 s of guest CPU. The before/after transfer comparison is still to do.
- [x] 2.2 p50/p95 of 50+ warm `azula compute exec -q -- /bin/true`, `doctor` and 1 KiB push and pull, and Bridge accept counts per request, before and after 1.2.
  - 2026-11-24, Pixel 10a, 60 runs: relay-only p50 1.94 s, p95 2.09 s; default path 1.81 s and 1.96 s; 2.0 Bridge connections per request (3 before 1.2, by construction). Almost all of a warm request is the CLI's own bind and relay registration, which 3.3 addresses.

## 3. Remaining findings (each: measure, then change, or drop)

- [x] 3.1 Proxy pump: separate direct-Android from proxied-guest throughput on the same Pixel against a fixed LAN origin first. Then try `Splice.kt` at 64 and 128 KiB (now 16 KiB, with a flush per chunk) and `recv_into` in `vm/avf-seed/azula-vsock-proxy`.
  - 2026-11-24, Pixel 10a, 256 MiB from a LAN origin, 5 runs per cell: the proxy is not the bottleneck, Wi-Fi is. Direct and proxied both run about 32 MiB/s at 1, 4 and 16 clients, on every build.
  - CPU per GiB in the app's `:vmhost`, 1 / 4 / 16 clients: 16 KiB 7.1 / 9.9 / 14.6 s; 64 KiB 5.3 / 9.8 / 12.7 s; 128 KiB 5.6 / 10.0 / 16.1 s. Landed 64 KiB (azula-app 1dec0c6).
  - The guest's Python shim costs more than the pump: 16 to 21 s per GiB for one client, 110 to 117 s at 16. `recv_into` wasn't tried; replacing the shim would be the bigger win, if guest CPU on downloads ever matters.
- [x] 3.2 `HostService.kt` `stageSeed()` copies `seed.iso` on every START.
  - 2026-11-24: not worth doing. The seed is 900 KB. Overlapping broker binding with AVF creation is still open, if a START trace shows it on the critical path.
- [ ] 3.3 Client endpoint reuse across a session (`src/compute/client.rs` `dial`): one retained Dialer per session and relay, a fresh authenticated connection per request. Verify expiry and revocation between and during commands. No wire change.
  - 2026-11-24, measured from a Mac relay-only through n0 (medians of 12-25): a fresh endpoint per request 1.84 s, of which 1.35 s is bind and relay registration; an endpoint kept between requests 0.37 s.
  - Landed the part that needs no new surface (azula-cli bf7b7be): a command whose token names the relay dials while it registers: 1.14 s. `doctor` still waits, and an unreachable relay gives the same error as before.
  - The rest needs a long-lived client (an opt-in `azula compute session` holding one endpoint behind a 0600 socket, say). That's a new CLI surface: Sal's decision, not started.
- [x] 3.4 `src/compute/transfer.rs` pull ignores the final flush result and renames without `sync_all` or a parent sync. Durability fix, measured separately.
  - 2026-11-24 (azula-cli 225d012): flush checked, file synced, renamed, directory synced; `pull -` reports a failed last write. About 10 ms for a small file and 27 ms for 64 MiB on a Mac.
- [ ] 3.5 Grant watcher polls every 2 s and guest timesync goes to the internet every 5 min: measure idle battery cost first, then decide.
  - 2026-11-24: a quiet attached follower no longer wakes every second (azula-cli 34b5dda).
- [x] 3.6 Single-file push framing copies and the push prehash before dialing (`transfer.rs` ~340, ~485; `frame.rs`).
  - 2026-11-24 (azula-cli 225d012): push data frames go out as header then the caller's payload, two copies fewer per chunk (14-19 us to 0.35 us per 512 KiB on a Mac); a push hashes and dials at once, giving the session back if the hash outlasts half the broker's 10 s request timeout. The guest's get still builds one buffer per frame (one 1 MiB copy, about 2% of a socket hop): not worth a change. The `push -r` entry count while archiving was written and then dropped: 100 lines of tar parsing to save one cached read.
- [ ] 3.7 Build parallelism (`-j`) and the memory ceiling: AVF uses MATCH_HOST, and the UI allows 1.5x the half-RAM default. Sweep `-j` on the phone with RAM fixed.
  - 2026-11-24: the host enforces that ceiling for a stored override too (azula-app 106139e). The ceiling on the 10a is 5376 MB, the setting at which lmkd killed the Terminal VM; whether to lower it is a decision for Sal after the sweep.

## 4. Hardening, not performance

- [x] 4.1 In the AVF seed the guest worker runs as root with `--run-as azula`, so single-file push and pull opened files as root.
  - 2026-11-23: first kept as is, because the job user has passwordless sudo there.
  - 2026-11-24: changed, at Sal's request to incorporate the audit (azula-cli 67ff0b1). Put, get and a job's `cwd` use the job user's credentials; the state dir is 0700. 12 of 12 root tests pass in a QEMU Debian 13 VM and fail against the old code. Two holes were found while doing it and fixed with it: a job's `cwd` was entered as root, and jobs could read the worker's state. Not yet run on a phone or in a Mac VM.
  - User-visible: pushing to a place only root can reach is now `io_error`; use `exec` with `sudo`.
- [x] 4.2 Ready accepted a failed tool install (any `provision rc=` counted, and so did the 15-minute backstop).
  - 2026-11-23: fixed under `compute-android-app-host` 3.8 (azula-app 3255df0, azula-cli aac8fe9): only a verified rc=0 counts, and a failed or missing report is a retryable error. Not yet run on a phone.

## 5. Found while measuring

- [x] 5.1 A finished response was cut off after 10 s. The broker gave the client 10 s to receive the rest of a response, then closed the connection; over n0's relay (about 45 KB/s per connection on 2026-11-24, both directions) a 1 MiB pull failed 5 of 5 on the Pixel 10a and from a Mac, resuming at 0 B each time, while two Test Lab Pixels passed a 9 MB pull on the same code (not understood).
  - Fixed in azula-cli bf7b7be: the broker waits while data moves and gives up after 30 s with nothing; data frames are 128 KiB. From a Mac, relay-only: 1 MiB pull 22.8 s, 2 MiB 45.5 s. Not yet re-run on a phone.
- [ ] 5.2 n0's public relay throttles each connection, with no published limits (docs.iroh.computer/relays/rate-limiting): about 45 KB/s measured today, so a 10 MB tree takes about 4 minutes relay-only. A relay of our own has no limit. Sal chose to stay on n0 for now (2026-11-24).
