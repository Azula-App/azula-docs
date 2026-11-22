## Context

azula-cli `main@43315ca` (0.3.1) binds every endpoint with `presets::N0` and
waits on `online()` with no deadline (`src/endpoint.rs`), pins iroh 1.0.0, and
has no notion of running work for a remote peer: `azula run` executes locally,
and `terminal attach` moves PTY bytes without a reliable exit status. Pairing,
invites and certificates identify peers, but nothing grants a scoped
capability to a headless, short-lived cloud sandbox.

The README already records that the Claude Code web container has no UDP and
reaches the internet only through an HTTPS proxy, so iroh works there only via
its relay, and only if the relay hostnames are allowlisted.

The wire contract between the three new processes is kept next to the code in
`azula-cli/vm/README.md` (frame format with a test vector, guest protocol,
helper CLI/config, bundle layout). This document records the decisions.

## Goals / Non-Goals

**Goals:** one Apple silicon Mac hosting Linux VMs; a cloud sandbox runs
commands in a named VM with separate stdout/stderr, stdin, a timeout and the
real exit code; files move in and out; the host can revoke access at any time;
nothing the guest or the cloud client sends can execute on the host.

**Non-Goals (this change):** macOS guests; a fleet scheduler or multiple
hosts behind one token; agent-provisioned VMs (designed in D10, built later);
VMs that survive a broker restart (D11); GPU, nested virtualization, live
snapshots; any path on the Mac host as a transfer target; changing
`terminal`, `run`, `mcp` or messaging behavior.

## Decisions

### D1. Prove the network path before anything else

The first deliverable is `azula compute doctor` plus endpoint options, and a
recorded run from a real Claude Code cloud sandbox. An HTTPS `curl` succeeding
proves nothing about iroh: the relay protocol upgrades HTTPS to WebSocket, the
sandbox proxy may terminate TLS with its own CA, and `online()` can succeed
while a peer dial still fails. The doctor runs bounded stages and reports the
first failing one: bind, relay reachable, dial host, authenticate, guest
worker health.

Every azula endpoint now honors `HTTPS_PROXY`/`HTTP_PROXY`/`NO_PROXY` for its
relay connection, and `AZULA_RELAY_ONLY=1` disables direct IP transports so a
sandbox doesn't burn time on UDP paths that can't work. iroh moves to 1.5,
which carries relay and proxy fixes 1.0.0 lacks. New code waits for the relay
with a deadline and says which relay it tried; existing callers keep their
current unbounded wait. If a provider's proxy blocks the relay upgrade, that is
recorded as a blocker for that provider rather than worked around.

### D2. Four processes, each with one job

| Process | Where | Job |
|---|---|---|
| `azula compute exec` etc. (client) | any OS | grant token → connect → stream |
| `azula compute serve` (broker) | Mac host | authenticate, authorize, manage VMs, splice job streams |
| `azula-vm run` (Swift helper) | Mac host, one per VM | Virtualization.framework lifecycle; vsock → Unix socket |
| `azula-guest` (worker) | inside the VM | run jobs, stream output, exit status |

Virtualization.framework needs Swift/Objective-C and the
`com.apple.security.virtualization` entitlement, so it lives in its own small
signed executable rather than in the Rust binary. **Changed from the draft:**
the draft had a long-lived helper daemon on an owner-only socket. Here the
broker spawns one `azula-vm run` per VM and controls it over stdin/stdout
JSON lines. There is no listener to secure, the helper accepts no host paths
or commands beyond its config file, and stdin EOF stops the VM, so a VM never
outlives the broker that started it.

**Changed from the draft:** the helper and the guest worker live in the
azula-cli repo (`vm/helper/`, `vm/guest/`) instead of a new repo. One PR
covers protocol changes on both sides of the boundary and one release ships
them together. Linux and Windows builds are untouched: the Swift package is
outside the Cargo build, `vm/guest/` is a standalone crate (its own
`[workspace]`), host-only Rust code is `cfg(target_os = "macos")`, and `vm/`
is excluded from the published crate.

### D3. Linux guests first

**Changed from the draft** (which targeted macOS guests first): the first
guest is the Debian 13 `generic` arm64 cloud image. It is a raw EFI disk that
`VZEFIBootLoader` boots directly, ships the full kernel (virtio-vsock and
virtiofs), and runs cloud-init. The download is checked against Debian's
SHA512SUMS. A VM is an APFS clone of the pristine image grown sparse, plus a
NoCloud seed ISO with a unique instance-id. Its cloud-init `runcmd` mounts a
read-only virtiofs share from the host and installs `azula-guest` and its
systemd unit from it. A VM therefore always runs the worker that ships with
the host's azula, and no image preparation step is needed.

macOS guests are a follow-up. macOS 27 added `VZMacGuestProvisioningOptions`
(create a user, auto-login, enable Remote Login on first boot), which removes
the Setup Assistant step that made macOS guests hard to automate. The draft
explicitly avoided it; for a macOS 27 host it is the obvious path.

### D4. The guest is reached over vsock, and holds no credentials

**Changed from the draft**, which had the guest worker join over iroh with a
one-time enrollment token. Here the worker listens on virtio-vsock port 1024,
and the helper exposes that port to the broker as a Unix socket (mode 0600) in
the VM's bundle directory. Only the host process that owns the VM can reach
the worker. There is no network listener in the guest, no guest key, no
enrollment token to leak or replay, and nothing to revoke when a VM is
deleted. Guests use NAT networking for outbound access (package installs) and
have no route to the host's shell, home directory or keychain. The only share
is the read-only worker directory.

Jobs run as an unprivileged `azula` user with passwordless sudo inside the
guest, the same model as a hosted CI runner. The VM is the isolation boundary;
root inside it is not a host privilege.

### D5. Bearer grants for headless sandboxes

**Changed from the draft**, which bound leases to an authenticated peer
identity. A cloud sandbox is a fresh container with a fresh iroh identity
every session, so the identity can't be what is authorized. `azula compute
grant` on the host mints a token:

```
azc1.<base64url(JSON {"v":1,"host":"<endpoint id>","relay":"<relay url>","grant":"<id>","secret":"<32 random bytes, base64url>"})>
```

The user stores it as a secret in the cloud environment
(`AZULA_COMPUTE_TOKEN`). The host keeps only the SHA-256 of the secret, with
an expiry (default 7 days), the allowed operations (`exec`, `vm`), and the
allowed VM names. `azula compute revoke <id>` ends it; `grants` lists them
with last use. The token embeds the host's relay URL so the client needs no
discovery lookup through the sandbox proxy. The secret is sent only inside the
QUIC connection to the endpoint id the token names, which TLS pins, so a
relay or proxy never sees it.

### D6. One frame format, one request per connection

Every hop uses the same frames: big-endian `u32` header length, `u32` payload
length, a JSON header with a `"t"` type, then raw payload bytes. Data stays
raw bytes; control stays readable JSON. Each request opens its own iroh
connection on ALPN `azula/compute/1`: `hello` (the grant secret), then one
request. For `exec` the broker checks the grant, starts nothing on the host,
opens the VM's vsock socket, forwards the request, and from then on copies
bytes in both directions. The broker never parses job output, so throughput is
bounded by the relay, not by re-framing.

Exec semantics: argv runs directly (shell only when argv names one); stdin is
closed unless requested, then forwarded with an explicit EOF; the default
timeout is 15 minutes (max 24 h); stdout and stderr stay separate; the job's
exit code becomes the client's exit code; failures of the client, transport or
protocol exit with codes and messages that can't be mistaken for a guest exit.

A client's disconnect no longer decides a job's fate on its own; see D7.

### D7. Jobs outlive connections

**Changed from the first version of this design**, where a disconnect
cancelled the job. Cloud sandboxes lose connections (relay restarts, proxy
idle cuts, the Mac sleeping) and get torn down, and rerunning a 20-minute
build because of a blip is the wrong trade. This restores the draft's
recoverable-jobs idea, simplified because the worker is the only place jobs
live:

- The guest worker owns job state. Each job has an id, an on-disk record
  (fsynced before the client hears `started`), and output written to disk
  first and to attached clients second. A slow or absent client never stalls
  a job, and output survives broker restarts and client churn.
- Output is addressed by absolute byte offset per stream. A client reattaches
  with the offsets it has already written and gets exactly the rest. If
  retention has already dropped those bytes (256 MiB per stream), it gets an
  explicit `gap`, never a silent hole.
- Exec carries a client-generated idempotency key, so "the connection died
  before I learned the job id" is recovered by resending the same exec. It
  never runs twice.
- A disconnect doesn't cancel a job, with two exceptions. A job still waiting
  for stdin is cancelled (`stdin_lost`), because running on with partial
  input is worse than failing. And `--cancel-on-disconnect` cancels a job
  that has had no client attached for 60 s, for work that's pointless
  unwatched.
- The client reconnects by itself for 5 minutes by default. After that, it
  exits 255 with the exact `attach` command. The job is still bounded by its
  own timeout and by its grant's expiry.

### D8. Files move to and from the VM, never the host

Sal's decision (2026-11-21): transfers address the VM's filesystem only; no
path on the Mac host is reachable. Single files use dedicated `put`/`get`
operations: SHA-256 is computed while streaming at both ends, and nothing is
renamed into place until size and digest match. Both directions resume. Puts
resume from the bytes already in the guest-side part file. Gets resume from
an offset, guarded by an etag so a changed file restarts instead of splicing
two versions together. Resumption also works across invocations: the client
records transfer ids in `~/.azula/compute/transfers.json`, so an agent that
simply reruns the command continues where it stopped. Directory trees use tar
through exec. Extraction on the client side is defensive, because a guest can
produce any archive: no absolute paths, no `..`, no links out, no device
nodes.

### D9. A grant is a principal; sharing a VM is cooperation, not isolation

Jobs and uploads belong to the grant that created them; another grant can't
list, attach to or cancel them, and asking about one gets the same
`not_found` as a job that doesn't exist. The broker stamps ownership on every
forwarded request, so a client can't claim another owner. An `admin` op lets a
grant (typically the host user's own) see and cancel everything.

Several sessions on one VM share its filesystem, packages and CPU — that is
the point of a shared "build" VM with warm caches, and it is also the risk
(two `apt-get` runs contend for dpkg's lock; two writers to one path race,
though each `put` is atomic and the last rename wins). The design doesn't
pretend otherwise: **isolation between sessions is a VM per session**, which is
cheap (an APFS clone and a ~6 s boot). Fairness caps keep one session from
starving the rest: 16 running jobs per owner, 64 per VM. `vm stop` refuses
while any owner's jobs run, unless forced by a grant with op `vm`.

### D10. One session, many VMs

A grant's VM scope is a list of names and `*` globs (`ci-*`). The client
chooses with `--vm` or `AZULA_COMPUTE_VM`, falling back to the grant's single
VM. Jobs are named `<vm>/<job id>`, so a ref is enough to reattach without
remembering which VM it ran on. Parallel jobs across VMs are just parallel
client invocations. The broker refuses to start a VM that would push the
running VMs' memory past the host's RAM minus 4 GiB (`host_busy`).

**Designed, not built in this change:** letting an agent create and delete its
own VMs. A grant op `provision` with a name prefix (`--vm-prefix agent-`) and a
quota (`--max-vms 3`) would allow `vm create <prefix><name> --from <template>`.
Here `<template>` is a stopped, host-prepared VM cloned with `clonefile`. The
agent could also delete the VMs it created, and they'd be deleted when the
grant expires or is revoked. Until then, the host user creates VMs and grants
cover them.

### D11. Failure handling

- **Host sleep**: while VMs run, `compute serve` holds an idle-sleep
  assertion (`caffeinate -i`). Lid-close sleep still happens. Clients ride out
  short sleeps with the reconnect window and long ones with `attach`.
- **Broker restart** (crash, upgrade, Ctrl-C) stops its VMs (D2), and running
  jobs become `interrupted`. Their records and output stay on the guest disk,
  visible to `jobs`/`logs` after the next start. **Accepted trade-off:**
  keeping VMs alive across broker restarts needs the helper to be adoptable
  (a control socket plus an orphan timeout). That's a later change if broker
  restarts turn out to be common.
- **Worker crash**: systemd restarts it in 1 s. Its jobs died with its cgroup
  and are marked `interrupted` at startup. Clients reconnect, attach, and see
  that.
- **VM stops unexpectedly** (guest panic, `sudo reboot`, `poweroff`; a
  Virtualization.framework guest can't reboot in place): the broker marks it
  stopped and the next request auto-starts it (if allowed). Jobs that were
  running are `interrupted`.
- **VM won't start or the worker never answers** (180 s): the broker stops it,
  records the error, and returns `vm_start_failed` with the helper error and
  console tail.
- **Disk full**: in the guest, output is dropped and flagged
  (`output_truncated`), jobs keep running, and puts fail with the OS error. On
  the host, `vm create` refuses without image size + 10 GiB free. Both show up
  in `vm status` and `doctor --vm`.
- **Revocation and expiry act on live sessions**: the broker watches the grant
  store and closes a revoked or expired grant's connections within ~2 s. Job
  timeouts are clamped to the grant's expiry, so nothing outlives its
  authorization. `revoke --cancel-jobs` also stops that grant's running jobs.
- **The VM's network**: NAT gives the guest the internet, the LAN, and
  whatever the Mac serves on non-loopback interfaces (like any device on the
  network). Services bound to `127.0.0.1` on the Mac are not reachable.
  `vm create --network none` gives a VM no network device at all.

### Scenario catalog

Each row is a behavior the implementation and its tests must show.

| # | Scenario | Expected behavior |
|---|---|---|
| H1 | First use: create VM, serve, grant, `doctor`, `exec` | doctor all ✓; exec streams output and returns the exit code; first exec auto-starts the VM (~6 s) |
| H2 | Long build streamed live | output arrives in order per stream; exit code passes through |
| H3 | `exec --detach`, later `logs --follow` / `attach` / `jobs` | job ref printed; output complete from offset 0; final exit code from attach |
| H4 | push sources, build, pull artifact | SHA-256-verified, atomic on both ends; `-r` for trees |
| H5 | several jobs at once in one VM | all run concurrently up to the per-owner and per-VM caps |
| H6 | one session, several VMs | `--vm`/`AZULA_COMPUTE_VM` choose; refs `vm/j_…`; globs in grant scope |
| H7 | two sessions, one VM, separate grants | each lists/attaches/cancels only its own jobs; shared filesystem |
| H8 | sandbox replaced by a new one with the same token | `jobs` shows earlier jobs; `attach`/`logs`/`pull` recover results |
| H9 | host user watches everything | admin grant: `jobs --all`, cancel any, force stop; broker log line per request |
| S1 | relay host not allowlisted | doctor fails at `relay` in ≤ 20 s naming the URL; exec exits 255 with the same hint |
| S2 | `compute serve` not running / Mac asleep | dial fails in ≤ 20 s; exit 255 "is compute serve running and the Mac awake?" |
| S3 | host's home relay changed since the token was minted | dial still succeeds via discovery (`dns.iroh.link`) |
| S4 | connection drops mid-exec | auto-reattach from offsets: no duplicate or missing bytes; one notice on stderr |
| S5 | connection drops before `started` | resend with same `idem`: deduped, never runs twice |
| S6 | connection drops while stdin is still streaming | job cancelled `stdin_lost`; client exits 255 explaining it |
| S7 | connection drops mid-push | resumes from the guest's part-file offset; final digest over the whole file |
| S8 | connection drops mid-pull; remote file then changes | resume refused with `changed`; restarts from 0 |
| S9 | client SIGKILLed / sandbox destroyed | job keeps running to completion or timeout (or is cancelled after 60 s with `--cancel-on-disconnect`); results kept 24 h |
| S10 | reconnect window exhausted | exit 255 with the exact `azula compute attach vm/j_…` command |
| S11 | output exceeds retention (256 MiB/stream) | live clients get everything; replay gets a `gap` frame and a stderr notice |
| S12 | guest disk full | output flagged truncated, job continues; put fails `io_error` (ENOSPC) |
| S13 | worker crashes mid-job | systemd restarts worker; job `interrupted`; client exits 255 saying so |
| S14 | job runs `sudo poweroff` / guest panics | VM marked stopped; job `interrupted`; next request auto-starts |
| S15 | VM fails to start / worker never answers | `vm_start_failed` with helper error + console tail; VM stopped |
| S16 | `compute serve` Ctrl-C or crash | VMs stop; jobs `interrupted`; records survive for `jobs`/`logs` |
| S17 | second `compute serve` | refused: already running, pid N |
| S18 | grant revoked mid-job | live connections closed in ~2 s; job continues unless `--cancel-jobs` |
| S19 | grant expires mid-job | job was already clamped to end by expiry; connections closed at expiry |
| S20 | attach to another grant's job / guessed id | `not_found`, indistinguishable from nonexistent |
| S21 | `vm stop` while others' jobs run | `vm_busy` with count; `--force` (op `vm`) interrupts them |
| S22 | too many jobs | `busy` (125) past 16 per owner / 64 per VM |
| S23 | starting a VM would exceed host memory | `host_busy` (125) |
| S24 | `vm delete` of a running VM | refused |
| S25 | token for a different host / host key regenerated | dial fails; doctor hint compares the token's host id with `compute grants` |
| S26 | pull of a directory without `-r` | `not_a_file` with a `-r` hint (exit 1) |
| S27 | `pull -r` archive with `../`, absolute paths, escaping links or device nodes | entry rejected, transfer fails (exit 1), nothing written outside LOCAL |
| S28 | push `--no-clobber` onto an existing file | `exists` (exit 1); target untouched |
| S29 | concurrent puts to one path | each atomic; last rename wins |
| S30 | client and host azula versions differ | hello carries `v`; unsupported → `unsupported_version` naming both versions |
| S31 | guest tries to reach the Mac | only via NAT to non-loopback services; `--network none` removes networking |

## Risks / Trade-offs

- **Cloud proxy blocks the relay upgrade** → D1's doctor finds it first;
  record the result per provider. Codex Cloud needs Sal's sign-in to test.
- **Laptop sleeps** → idle sleep is held off while VMs run; lid-close sleep
  pauses everything, and clients reconnect or reattach afterwards (D7, D11).
- **Broker quits** → its VMs stop and running jobs become `interrupted` (D2,
  D11); clients report that, never a fabricated exit code.
- **Shared VMs** → sessions on one VM can interfere with each other's files
  and packages by design (D9); a VM per session is the isolation answer.
- **Bearer token leaks** → short default expiry, scoped VMs and operations,
  revocation, last-use audit; the token can't run anything on the host itself.
- **n0's public relays are a dependency** → same as the rest of azula; a
  self-hosted relay is a later option and the token carries the relay URL.
- **Disk use** → images are clones; `vm delete` removes a VM; guest output and
  finished jobs have retention limits (D7); `vm create` checks host free space.

## Migration Plan

Opt-in. Nothing runs until the user runs `azula compute serve` and mints a
grant. The iroh bump is the only change that touches existing commands, and
it's verified by the existing test suite. Rollback: stop `compute serve`
(stopping its VMs) and revoke grants. VM bundles under `~/.azula/vm/` can be
deleted at any time.
