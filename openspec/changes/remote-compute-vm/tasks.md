Groups 2–5 can proceed in parallel with group 1, but the cloud claim in
group 7 depends on group 1 passing from a real sandbox. The scenario catalog
in design.md (H1–H9, S1–S31) is the acceptance list for groups 3–7.

## 1. Network path (azula-cli)

- [x] 1.1 Bump iroh 1.0.0 → 1.5.x and the iroh-* crates; fix API changes; existing tests and clippy stay green.
- [x] 1.2 Endpoint options in `src/endpoint.rs`: relay proxy from `HTTPS_PROXY`/`NO_PROXY` for every endpoint, `AZULA_RELAY_ONLY=1`, OS trust store for relay TLS, and a bounded online wait for new callers that names the relay and redacts proxy credentials.
- [x] 1.3 Check iroh 1.5's default relay hostnames and update the README allowlist table.
- [x] 1.4 `azula compute doctor`: bounded bind / relay / dial / auth / guest stages with a per-stage error and hint.
- [ ] 1.5 Run the doctor from a real Claude Code cloud sandbox (environment with the n0 relays allowlisted) against the Mac and record the result here.

## 2. VM helper (`azula-cli/vm/helper`, Swift)

- [x] 2.1 `azula-vm check|init|run` per `vm/README.md` §3, ad-hoc signed with `com.apple.security.virtualization` by `build.sh`.
- [x] 2.2 Boot the Debian 13 arm64 image (EFI, NAT, virtiofs, virtio console log) from an APFS clone; the image is unchanged afterwards.
- [x] 2.3 vsock → Unix socket bridge (0600) with half-close propagation and prompt close when the guest isn't listening.
- [x] 2.4 Stop semantics: `stop` op, `kill` op, stdin EOF and SIGTERM all stop the VM; `stopped` is the last event.
- [ ] 2.5 `"network":"none"` config: no network device.

## 3. Guest worker (`azula-cli/vm/guest`, Rust)

- [x] 3.1 Frame codec with the README §1 test vector, mirrored by the broker's codec.
- [x] 3.2 ping and exec: direct argv, clean env, run-as user, own process group, separate streams, stdin + EOF, timeout, cancel kills the group, `exit` after drain.
- [x] 3.3 Static `aarch64-unknown-linux-musl` build linked with rust-lld; systemd unit.
- [x] 3.4 Tests over TCP on the host for 3.2.
- [ ] 3.5 Durable jobs (README §2.1): fsynced records, segmented on-disk output with offsets and retention, idempotency keys, owner checks, `interrupted` reconciliation at start, `busy` caps, disk-full truncation without stalling.
- [ ] 3.6 Disconnect rules: jobs survive; `stdin_lost`; `cancel_on_disconnect` after 60 s unattached.
- [ ] 3.7 `attach` (replay + follow, gap frames, multiple attachers), `jobs`, `cancel_job`.
- [ ] 3.8 Resumable `put` (upload ids, part files kept 24 h, digest continued over the existing prefix) and `get` (offset + etag, whole-file digest).
- [ ] 3.9 Tests for every 3.5–3.8 behavior, including restart reconciliation and retention gaps; a real-VM run of the lockdown user-data showing only vsock 1024 listening.

## 4. Broker, grants and VMs (azula-cli `src/compute/`)

- [x] 4.1 Grants: `compute grant|grants|revoke`, `azc1.` token, hashed secrets, expiry, ops and VM scope, last-use audit; never log secrets.
- [x] 4.2 `vm create|delete|list`: image with SHA512 check, APFS clone + sparse grow, per-VM identity via `azula-vm init`, NoCloud seed, worker share.
- [x] 4.3 `compute serve`: iroh endpoint on ALPN `azula/compute/1`, hello/grant check, request dispatch; VM manager; VMs stop when the broker exits.
- [x] 4.4 exec splice and `vm start|stop|status` over the same protocol.
- [ ] 4.5 Forward `attach`/`jobs`/`cancel_job`/`put`/`get`; stamp `owner`; `admin` op and `all`; VM globs in scope; clamp timeouts to grant expiry (`grant_expiring`).
- [ ] 4.6 Live revocation/expiry closing connections; `revoke --cancel-jobs`.
- [ ] 4.7 `vm_busy` / `--force`; `host_busy` memory budget; host free-space check on create; `--network none`; idle-sleep assertion with `--allow-sleep`; stop + record on failed starts.
- [ ] 4.8 QUIC keep-alive 2 s / idle 10 s on compute connections at both ends.

## 5. Client (azula-cli)

- [x] 5.1 `compute exec` (exit code passthrough, `--stdin`, `--env`, `--cwd`, `--timeout`, `--json`) and `vm start|stop|status`, reading `AZULA_COMPUTE_TOKEN`.
- [ ] 5.2 Job refs `vm/j_…`, `AZULA_COMPUTE_VM`, idem keys, `--detach`, `--cancel-on-disconnect`, `--label`, `--quiet`, the job-started notice, auto-reconnect with offsets within `--reconnect`, the give-up message, double-SIGINT detach.
- [ ] 5.3 `attach`, `logs [--follow] [--tail]`, `jobs [--all]`, `cancel`.
- [ ] 5.4 `push`/`pull` single files (resume within and across invocations via `transfers.json`, local atomic rename, `-` for stdio) and `-r` via tar with defensive extraction.
- [ ] 5.5 Client verbs log at `warn` by default.
- [ ] 5.6 Host-only code gated to macOS; Linux/Windows builds and clippy unchanged; `vm/` excluded from the crate package.

## 6. Packaging

- [x] 6.1 Release workflow: build and sign `azula-vm` and build `azula-guest` on the macOS arm64 leg; ship both inside that leg's archive, the npm platform package and the Homebrew formula, next to `azula`.
- [ ] 6.2 Verify the first tagged release's macOS arm64 archive contains both companions and `compute serve` finds them.

## 7. End to end

- [ ] 7.1 Local, over the relay with `AZULA_RELAY_ONLY=1`: the scenario catalog rows that don't need a cloud sandbox.
- [ ] 7.2 From the real Claude Code cloud sandbox: doctor, exec, push → build → pull, timeout, reconnect after a forced drop, detach + attach, revoke. Record a summary here.
- [ ] 7.3 Docs: azula-cli README section and the azula.app docs page; run the `doc-examples` skill; validate and archive this change.
