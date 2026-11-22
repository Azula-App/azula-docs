# remote-compute Specification

## Purpose

Let a remote azula client — typically a Claude Code or Codex cloud sandbox — run
commands and move files inside Linux VMs on an Apple silicon Mac, over iroh,
authorized by revocable grants, without anything the client sends executing on
the Mac itself. Shipped in azula-cli 0.4.1 (`azula compute`, `azula vm`); see
`design.md` for the architecture and where the wire contract lives.

## Requirements

### Requirement: Compute Hosting Is Apple Silicon macOS Only
`azula compute serve`, `azula compute grant|grants|revoke` and `azula vm create|delete|list` SHALL run only on Apple silicon macOS and SHALL fail with an explanatory error elsewhere. The client verbs `azula compute exec`, `azula compute doctor` and `azula vm start|stop|status` SHALL work on every platform azula supports. Builds and release artifacts for other platforms SHALL NOT require Swift or contain the VM helper.

#### Scenario: Host verb on Linux
- **WHEN** `azula compute serve` runs on Linux
- **THEN** it exits nonzero with a message that compute hosting requires Apple silicon macOS

#### Scenario: Client verb on Linux
- **WHEN** a Linux cloud sandbox runs `azula compute exec -- uname -a` with a valid token
- **THEN** the command runs in the host's VM and the client prints its output

### Requirement: Grants Authorize Remote Compute
A remote client SHALL be authorized only by a grant the host minted. `azula compute grant` SHALL print a token naming the host's endpoint id, the host's relay URL, a grant id, and a secret of at least 256 bits. The host SHALL store only a hash of the secret, together with an expiry, the allowed operations and the allowed VM names.

#### Scenario: Secret only reaches the named host
- **WHEN** a client connects using a token
- **THEN** it sends the secret only on a connection authenticated as the endpoint id the token names

#### Scenario: Host stores no usable secret
- **WHEN** the host's grant store is read
- **THEN** it contains a hash of each secret and not the secret itself

### Requirement: Grant Enforcement And Revocation
The broker SHALL reject a request whose grant is unknown, expired, revoked, or does not allow the requested operation or VM, and SHALL perform no action for it. `azula compute revoke` SHALL make a grant unusable for all new requests immediately. Tokens and secrets SHALL NOT be written to logs or to status output.

#### Scenario: Revoked grant
- **WHEN** a grant is revoked and a client then presents its token
- **THEN** the broker replies with an `unauthorized` error and runs nothing

#### Scenario: Grant scoped to one VM
- **WHEN** a grant allows only VM `build` and the client requests exec in VM `other`
- **THEN** the broker replies with a `forbidden` error and runs nothing

### Requirement: Relay Traffic Honors Proxies
Every azula endpoint SHALL send its relay traffic through the proxy named by `HTTPS_PROXY`/`HTTP_PROXY` unless `NO_PROXY` excludes the relay host, and SHALL verify relay TLS against the operating system's trust store. When `AZULA_RELAY_ONLY=1` is set, azula SHALL NOT attempt direct IP paths.

#### Scenario: Sandbox without UDP
- **WHEN** the client runs in an environment with no UDP egress and a TLS-intercepting HTTPS proxy, whose CA is in the system trust store, that allows the relay host
- **THEN** the client reaches the host over the relay

### Requirement: Compute Doctor Reports The Failing Stage
`azula compute doctor` SHALL check, each with its own deadline, that it can bind, reach the relay, dial the host, authenticate, and (with `--vm`) reach the guest worker. It SHALL report which stage failed, with the relay URL and a hint, and SHALL NOT print credentials embedded in proxy URLs.

#### Scenario: Relay blocked
- **WHEN** the proxy refuses the relay host
- **THEN** `azula compute doctor` fails at the relay stage within its deadline and names the relay URL

#### Scenario: All stages pass
- **WHEN** the relay is allowed and the grant is valid
- **THEN** `azula compute doctor` reports every stage as passed

### Requirement: Jobs Execute Only Inside The Guest
The broker SHALL execute nothing on the host on behalf of a client. An exec request SHALL run its argv directly, with no implicit shell, inside the named VM, as the guest's unprivileged job user, in its own process group.

#### Scenario: No implicit shell
- **WHEN** a client runs `azula compute exec -- echo '$HOME'`
- **THEN** the output is the literal text `$HOME`

### Requirement: Job Streams And Exit Status
stdout and stderr SHALL be delivered as separate byte streams, each in order. Stdin SHALL be closed unless the client requests it, in which case the client's stdin SHALL be forwarded followed by an explicit end-of-file. The client SHALL exit with the job's exit code, and SHALL report a transport or protocol failure distinctly from any guest exit.

#### Scenario: Exit code is preserved
- **WHEN** a client runs `azula compute exec -- sh -c 'exit 7'`
- **THEN** the client process exits with code 7

#### Scenario: Transport failure is not a guest exit
- **WHEN** the connection to the host drops while a job runs
- **THEN** the client exits with an azula transport error code and message, never with a guest exit code it did not receive

#### Scenario: Binary-safe stdin and stdout
- **WHEN** a client pipes a tar archive through `azula compute exec --stdin -- tar -x -C /work` and later pulls it back with `azula compute exec -- tar -c -C /work .`
- **THEN** the files round-trip byte for byte

### Requirement: Job Timeout And Cancellation
A job SHALL be stopped when its timeout (default 15 minutes, at most 24 hours, and never later than its grant's expiry) expires, or when a client holding its grant cancels it: SIGTERM to its process group, then SIGKILL after 5 seconds.

#### Scenario: Timeout
- **WHEN** a job runs past its timeout
- **THEN** it is stopped and the client exits with code 124

#### Scenario: Timeout clamped to grant expiry
- **WHEN** a job is started with a timeout that would end after its grant expires
- **THEN** the job is stopped no later than the grant's expiry

### Requirement: Jobs Outlive Connections
A job SHALL keep running when the connection that started it closes, with two exceptions: a job whose stdin has not reached end-of-file SHALL be cancelled with reason `stdin_lost`, and a job started with cancel-on-disconnect SHALL be cancelled after 60 seconds with no attached client. Job output SHALL be stored in the guest before it is sent, so no client's speed can stall a job.

#### Scenario: Sandbox destroyed mid-build
- **WHEN** the client is killed while a build runs in the guest
- **THEN** the build runs to completion and its output and exit code remain retrievable for 24 hours

#### Scenario: Partial stdin
- **WHEN** the connection closes before the client sent stdin end-of-file
- **THEN** the job is cancelled with reason `stdin_lost`

### Requirement: Reattach Resumes Output Exactly
A client SHALL be able to reattach to a job by its reference and byte offsets per stream and receive the remaining output with no bytes repeated or skipped. When requested bytes are no longer retained, the client SHALL be told the size of the gap rather than receive a silent hole. `azula compute exec` SHALL reattach automatically for a configurable window (default 5 minutes) and, when it gives up, SHALL exit 255 printing the command that reattaches.

#### Scenario: Blip mid-exec
- **WHEN** the connection drops and recovers while a job is producing output
- **THEN** the client's stdout equals the job's complete stdout

#### Scenario: Window exhausted
- **WHEN** the host stays unreachable past the reconnect window
- **THEN** the client exits 255 and prints `azula compute attach <vm>/<job>`

### Requirement: Exec Is Idempotent
Every exec request SHALL carry a client-generated idempotency key. A repeated request with the same grant and key SHALL return the existing job instead of starting another, and the same key with different parameters SHALL be rejected.

#### Scenario: Lost acknowledgement
- **WHEN** the connection drops after the exec was sent but before the job id arrived, and the client resends it
- **THEN** exactly one job runs and the client attaches to it

### Requirement: Grant Owns Its Jobs
Jobs and uploads SHALL belong to the grant that created them. Another grant SHALL NOT list, attach to, or cancel them, and SHALL receive the same `not_found` as for a nonexistent job. Only a grant with the `admin` operation MAY see and cancel every grant's jobs. The broker, not the client, SHALL assign ownership.

#### Scenario: Two sessions share a VM
- **WHEN** grants A and B each run jobs on the same VM and A lists jobs
- **THEN** A sees only its own jobs and gets `not_found` when attaching to one of B's

### Requirement: File Transfer To And From The VM
`azula compute push` and `azula compute pull` SHALL copy files between the client's filesystem and the VM's filesystem, and SHALL NOT be able to address any path on the host. A single-file transfer SHALL be verified by size and SHA-256 at the receiving end and SHALL replace its destination atomically, so the destination is never left partial.

#### Scenario: Digest mismatch
- **WHEN** received bytes don't match the sender's size or digest
- **THEN** the destination is left unchanged and the command exits 1

#### Scenario: Interrupted push
- **WHEN** a push is cut off and run again
- **THEN** it resumes from the bytes already in the guest and the result passes digest verification

#### Scenario: Remote file changed during resume
- **WHEN** a pull resumes but the guest file changed since it began
- **THEN** the pull restarts from the beginning instead of combining two versions

### Requirement: Tree Transfers Extract Defensively
A recursive pull SHALL reject archive entries with absolute paths, `..` components, links resolving outside the destination, entries beneath a symlinked parent, and device or FIFO nodes, and SHALL NOT write outside the destination directory.

#### Scenario: Malicious archive
- **WHEN** the guest returns a tree containing `../escape` and a symlink to `/etc`
- **THEN** the pull fails and nothing outside the destination is created or modified

### Requirement: Multiple VMs Per Grant
A grant SHALL be able to cover several VMs by name or glob. The client SHALL select a VM with `--vm` or `AZULA_COMPUTE_VM`, defaulting to the grant's only VM, and job references SHALL include the VM name.

#### Scenario: Parallel jobs across VMs
- **WHEN** one session runs jobs on VMs `a` and `b` at the same time
- **THEN** both run, and each job reference names its own VM

### Requirement: Live Revocation
Revoking a grant SHALL close that grant's live connections within a few seconds, and the broker SHALL also close them when the grant expires. Its running jobs SHALL continue unless the revocation requests that they be cancelled.

#### Scenario: Revoked mid-stream
- **WHEN** a grant is revoked while its client is streaming a job's output
- **THEN** the connection is closed within 5 seconds and reconnecting is refused

### Requirement: Resource Guards
The worker SHALL refuse new jobs past 16 running per grant or 64 per VM with `busy`. The broker SHALL refuse to start a VM whose memory would exceed host RAM minus 4 GiB with `host_busy`. A VM stop SHALL be refused with `vm_busy` while any jobs run, unless forced by a grant allowed to control VMs. While any VM runs, the broker SHALL prevent idle sleep unless told not to.

#### Scenario: Stop protects others' jobs
- **WHEN** a grant stops a VM where another grant's job is running, without force
- **THEN** the stop is refused with `vm_busy` and the job keeps running

### Requirement: VM Lifecycle
`azula vm create <name>` SHALL create a VM from a checksum-verified image without modifying the image, giving the VM its own disk, EFI variable store, machine identifier, MAC address and cloud-init instance id. `azula vm start|stop|status` SHALL be served by the broker, and a VM SHALL NOT keep running after the broker that started it exits. `azula vm delete <name>` SHALL refuse a running VM and otherwise remove its bundle.

#### Scenario: Two VMs from one image
- **WHEN** VMs `a` and `b` are created from the same image and both started
- **THEN** each has a distinct machine identifier, MAC address and hostname, and the image file is unchanged

#### Scenario: Broker exit stops VMs
- **WHEN** `azula compute serve` exits while a VM it started is running
- **THEN** that VM is shut down

### Requirement: Guest Worker Isolation
The guest worker SHALL be reachable only through the VM's virtio socket device, exposed on the host as a Unix socket readable and writable only by the host user. The guest SHALL hold no azula identity, grant, token or host credential, and the host SHALL share no directory with the guest except the read-only directory the worker is installed from.

#### Scenario: No network listener in the guest
- **WHEN** the guest's listening sockets are inspected
- **THEN** the worker listens only on vsock, not on any IP address
