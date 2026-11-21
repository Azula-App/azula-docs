## ADDED Requirements

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
A job SHALL be stopped when its timeout (default 15 minutes, at most 24 hours) expires or when the client cancels or disconnects: SIGTERM to its process group, then SIGKILL after 5 seconds.

#### Scenario: Disconnect cancels the job
- **WHEN** the client is killed while `sleep 600` runs in the guest
- **THEN** the guest process group is terminated within 10 seconds

#### Scenario: Timeout
- **WHEN** a job runs past its timeout
- **THEN** it is stopped and the client reports the timeout

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
