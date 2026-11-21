Groups 2–5 can proceed in parallel with group 1, but the cloud claim in
group 6 depends on group 1 passing from a real sandbox.

## 1. Network path (azula-cli)

- [ ] 1.1 Bump iroh 1.0.0 → 1.5.x and the iroh-* crates; fix API changes; existing tests and clippy stay green.
- [ ] 1.2 Endpoint options in `src/endpoint.rs`: relay proxy from `HTTPS_PROXY`/`NO_PROXY` for every endpoint, `AZULA_RELAY_ONLY=1`, OS trust store for relay TLS, and a bounded online wait for new callers that names the relay and redacts proxy credentials.
- [ ] 1.3 Check iroh 1.5's default relay hostnames and update the README allowlist table.
- [ ] 1.4 `azula compute doctor`: bounded bind / relay / dial / auth / guest stages with a per-stage error and hint.
- [ ] 1.5 Run the doctor from a real Claude Code cloud sandbox (environment with the n0 relays allowlisted) against the Mac and record the result here.

## 2. VM helper (`azula-cli/vm/helper`, Swift)

- [ ] 2.1 `azula-vm check|init|run` per `vm/README.md` §3, ad-hoc signed with `com.apple.security.virtualization` by `build.sh`.
- [ ] 2.2 Boot the Debian 13 arm64 image (EFI, NAT, virtiofs, virtio console log) from an APFS clone; the image is unchanged afterwards.
- [ ] 2.3 vsock → Unix socket bridge (0600) with half-close propagation and prompt close when the guest isn't listening.
- [ ] 2.4 Stop semantics: `stop` op, `kill` op, stdin EOF and SIGTERM all stop the VM; `stopped` is the last event.

## 3. Guest worker (`azula-cli/vm/guest`, Rust)

- [ ] 3.1 Frame codec with the README §1 test vector, mirrored by the broker's codec.
- [ ] 3.2 ping and exec per README §2: direct argv, clean env, run-as user, own process group, separate streams, stdin + EOF, timeout, cancel and disconnect kill the group, `exit` after drain.
- [ ] 3.3 Static `aarch64-unknown-linux-musl` build linked with rust-lld; systemd unit.
- [ ] 3.4 Tests over TCP on the host: every behavior in 3.2, including large output order and no leftover processes.

## 4. Broker, grants and VMs (azula-cli `src/compute/`)

- [ ] 4.1 Grants: `compute grant|grants|revoke`, `azc1.` token, hashed secrets, expiry, ops and VM scope, last-use audit; never log secrets.
- [ ] 4.2 `vm create|delete|list`: image download with SHA512 check, APFS clone + sparse grow, per-VM identity via `azula-vm init`, NoCloud seed ISO with unique instance-id and the worker install `runcmd`, share dir with the guest binary and unit.
- [ ] 4.3 `compute serve`: iroh endpoint on ALPN `azula/compute/1`, hello/grant check, request dispatch; VM manager spawning `azula-vm run` and tracking state; VMs stop when the broker exits.
- [ ] 4.4 exec: authorize, require a running VM with a healthy worker (optionally auto-start), splice to the guest socket; `vm start|stop|status` over the same protocol.
- [ ] 4.5 Client verbs `compute exec` (exit code passthrough, `--stdin`, `--env`, `--cwd`, `--timeout`, `--json` JSONL) and `vm start|stop|status`, reading `AZULA_COMPUTE_TOKEN`.
- [ ] 4.6 Host-only code gated to macOS; Linux/Windows builds and clippy unchanged; `vm/` excluded from the crate package.

## 5. Packaging

- [ ] 5.1 Release workflow: build and sign `azula-vm` and build `azula-guest` on the macOS arm64 leg; ship both inside that leg's archive next to `azula`; the broker finds them next to its own executable.
- [ ] 5.2 Linux/Windows artifacts and npm platform packages unchanged apart from the iroh bump.

## 6. End to end

- [ ] 6.1 Local: grant → serve → `vm create` → exec over the relay with `AZULA_RELAY_ONLY=1`, including stdin tar round trip, nonzero exit, timeout, disconnect cancel, revoke.
- [ ] 6.2 From the real Claude Code cloud sandbox: doctor, `vm start`, exec a build in the guest, tar a result back, `vm stop`. Record the transcript summary here.
- [ ] 6.3 Docs: azula-cli README section and azula.app docs page; run the `doc-examples` skill; validate and archive this change.
