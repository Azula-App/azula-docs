## RENAMED Requirements

- FROM: `### Requirement: Compute Hosting Is Apple Silicon macOS Only`
- TO: `### Requirement: Compute Hosting Platforms`

## MODIFIED Requirements

### Requirement: Compute Hosting Platforms
`azula compute serve` and `compute grant|grants|revoke` SHALL run on Apple silicon macOS (VM backend) and on Linux only through `serve --local` (local backend). `azula vm create|delete|list` SHALL run only on Apple silicon macOS. Host verbs SHALL fail with an explanatory error elsewhere. Client verbs (`compute exec|doctor`, `vm start|stop|status`) SHALL work on every supported platform. Non-macOS artifacts SHALL NOT contain the Swift VM helper.

#### Scenario: Host verb on Linux
- **WHEN** `azula compute serve` runs on Linux without `--local`
- **THEN** it exits nonzero and explains that on Linux the broker runs jobs on this machine, which is only appropriate when the machine is itself an isolated VM

#### Scenario: Linux serve with the local backend
- **WHEN** `azula compute serve --local` runs inside Android's Linux Terminal VM and the job user is set up
- **THEN** it serves `azula/compute/1` with one VM, and a client holding a grant for it can run `azula compute exec -- uname -a`

#### Scenario: VM verbs stay macOS-only
- **WHEN** `azula vm create build` runs on Linux
- **THEN** it exits nonzero with a message that creating VMs requires Apple silicon macOS

#### Scenario: Client verb on Linux
- **WHEN** a Linux cloud sandbox runs `azula compute exec -- uname -a` with a valid token
- **THEN** the command runs on the host's VM (or on the local-backend host) and the client prints its output

### Requirement: Jobs Execute Only Inside The Guest
The broker SHALL execute nothing on behalf of a client, except through the guest worker. An exec request SHALL run its argv directly, with no implicit shell, as the guest's unprivileged job user, in its own process group. For the VM backend the guest is the named VM. For the local backend the guest is the broker's own machine.

#### Scenario: No implicit shell
- **WHEN** a client runs `azula compute exec -- echo '$HOME'`
- **THEN** the output is the literal text `$HOME`

### Requirement: Resource Guards
The worker SHALL refuse new jobs past 16 running per grant or 64 per VM with `busy`. With the VM backend, the broker SHALL refuse to start a VM whose memory would exceed host RAM minus 4 GiB with `host_busy`. A VM stop SHALL be refused with `vm_busy` while any jobs run, unless forced by a grant allowed to control VMs. On macOS, while any VM runs, the broker SHALL prevent idle sleep unless told not to.

#### Scenario: Stop protects others' jobs
- **WHEN** a grant stops a VM where another grant's job is running, without force
- **THEN** the stop is refused with `vm_busy` and the job keeps running

### Requirement: Guest Worker Isolation
The guest worker SHALL be reachable only through a channel only the broker can open: for the VM backend, the VM's vsock device exposed as a Unix socket only the host user can open; for the local backend, a Unix socket only the broker's user can open. With the VM backend, the guest SHALL hold no azula identity, grant, token or host credential, and SHALL share no host directory except the read-only worker directory.

#### Scenario: No network listener in the guest
- **WHEN** the guest's listening sockets are inspected
- **THEN** the worker listens only on vsock or the broker-only Unix socket, not on any IP address

## ADDED Requirements

### Requirement: Local Backend Confinement
With the local backend, everything a client causes to run, read or write SHALL run with no more privilege than the job user. That covers jobs, attach, and file push and pull. The job user SHALL NOT be able to read the broker's host key, its grant store, or the Android shared-storage mount `/mnt/shared`.

#### Scenario: Push cannot escape the job user
- **WHEN** a client with a valid grant runs `azula compute push key.txt /home/droid/.azula/compute/host.key` against a local-backend host
- **THEN** the push fails with a file error and the broker's host key is unchanged

#### Scenario: Jobs cannot read broker secrets or shared storage
- **WHEN** a job runs `cat ~droid/.azula/compute/host.key` or `ls /mnt/shared`
- **THEN** both fail with a permission error

### Requirement: Local Backend Job User Checks
`azula compute serve --local` SHALL refuse to start, naming the violation, when the configured job user is root, is the broker's own user, or can gain root through membership in `sudo` or `wheel`.

#### Scenario: Job user can use sudo
- **WHEN** `azula compute serve --local --run-as droid` runs and `droid` is in the `sudo` group
- **THEN** serve exits nonzero, naming the `sudo` membership, before binding its endpoint

#### Scenario: Job user is the broker's user
- **WHEN** the broker runs as `droid` and `--run-as droid` is given
- **THEN** serve exits nonzero, explaining that jobs must not run as the broker's user

### Requirement: Local Backend Lifecycle
With the local backend, the broker SHALL serve exactly one VM. Its name is configurable and defaults to `default`. `vm list` and `vm status` SHALL report the local host's online CPUs and total memory, with `image` `local` and `network` `host`. `vm start` SHALL succeed once the worker answers a ping. `vm stop` SHALL be refused with error `unsupported`. Jobs SHALL keep running and stay attachable when the broker restarts.

#### Scenario: Stop is refused
- **WHEN** a grant with op `vm` runs `azula vm stop default` against a local-backend host
- **THEN** the client exits 125 with error `unsupported`, and running jobs continue

#### Scenario: Broker restart keeps jobs
- **WHEN** the broker restarts while a job runs
- **THEN** the job is still `running` and `azula compute attach` resumes its output
