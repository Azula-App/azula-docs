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
hosts behind one token; durable jobs that survive a client disconnect;
per-job disposable clones; GPU, nested virtualization, live snapshots;
changing `terminal`, `run`, `mcp` or messaging behavior.

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

**Deferred from the draft:** durable job IDs, idempotency keys, journaled
launch intent and cursor-addressed log replay. In this change a client
disconnect cancels the job (SIGTERM to its process group, SIGKILL after 5 s).
That is honest and simple, and a cloud agent that loses its connection reruns
the command. The draft's recovery design is the next change once the path
works end to end.

**Deferred from the draft:** dedicated `push`/`pull` with digests. Files move
through exec stdin/stdout (`tar -c … | azula compute exec --stdin -- tar -x …`),
which is binary-safe because data frames are raw bytes.

## Risks / Trade-offs

- **Cloud proxy blocks the relay upgrade** → D1's doctor finds it first;
  record the result per provider. Codex Cloud needs Sal's sign-in to test.
- **Laptop sleeps or the broker quits** → the VM stops with it (D2); a job in
  flight ends with a transport error and no exit code, never a fabricated one.
- **Bearer token leaks** → short default expiry, scoped VMs and operations,
  revocation, last-use audit; the token can't run anything on the host itself.
- **n0's public relays are a dependency** → same as the rest of azula; a
  self-hosted relay is a later option and the token carries the relay URL.
- **Disk use** → images are clones; `vm delete` removes a VM; quotas later.

## Migration Plan

Opt-in. Nothing runs until the user runs `azula compute serve` and mints a
grant. The iroh bump is the only change that touches existing commands, and
it's verified by the existing test suite. Rollback: stop `compute serve`
(stopping its VMs) and revoke grants. VM bundles under `~/.azula/vm/` can be
deleted at any time.
