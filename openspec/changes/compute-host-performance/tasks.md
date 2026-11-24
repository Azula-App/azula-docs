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
- [ ] 2.2 p50/p95 of 50+ warm `azula compute exec -q -- /bin/true`, `doctor` and 1 KiB push and pull, and Bridge accept counts per request, before and after 1.2.

## 3. Remaining findings (each: measure, then change, or drop)

- [ ] 3.1 Proxy pump: separate direct-Android from proxied-guest throughput on the same Pixel against a fixed LAN origin first. Then try `Splice.kt` at 64 and 128 KiB (now 16 KiB, with a flush per chunk) and `recv_into` in `vm/avf-seed/azula-vsock-proxy`.
- [ ] 3.2 `HostService.kt` `stageSeed()` copies `seed.iso` on every START: stage by content identity and reuse the verified copy; consider overlapping broker binding with AVF creation where a trace shows it helps.
- [ ] 3.3 Client endpoint reuse across a session (`src/compute/client.rs` `dial`): one retained Dialer per session and relay, a fresh authenticated connection per request. Verify expiry and revocation between and during commands. No wire change.
- [ ] 3.4 `src/compute/transfer.rs` pull ignores the final flush result and renames without `sync_all` or a parent sync. Durability fix, measured separately.
- [ ] 3.5 Grant watcher polls every 2 s, a quiet attached follower wakes every 1 s, guest timesync goes to the internet every 5 min: measure idle battery cost first, then decide.
- [ ] 3.6 Single-file push framing copies and the push prehash before dialing (`transfer.rs` ~340, ~485; `frame.rs`).
- [ ] 3.7 Build parallelism (`-j`) and the memory ceiling: AVF uses MATCH_HOST, and the UI allows 1.5x the half-RAM default. Sweep `-j` on the phone with RAM fixed.

## 4. Hardening, not performance

- [ ] 4.1 In the AVF seed the guest worker runs as root with `--run-as azula`, so single-file push and pull open files as root. The job user has passwordless sudo in that guest, so it's no new privilege, but the local-backend findings say the worker should run as the job user. Decide, and record the decision in `compute-android-app-host` design.md.
- [ ] 4.2 Ready accepts a failed tool install (`HostService.kt` ~472: any `provision rc=` counts, and so does the 15-minute backstop). Tracked under `compute-android-app-host` 3.8, sent 2026-11-23, not fixed here; check it off when 3.8 lands.
