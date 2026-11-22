## ADDED Requirements

### Requirement: Android App Host
On Android devices with AVF support for non-protected VMs, the azula app's host feature SHALL host one Linux VM and serve it on `azula/compute/1` through the broker's attach mode. The client protocol, tokens, durable jobs and file transfer SHALL be identical to a Mac host. Hosting SHALL NOT require Google's Linux Terminal app.

#### Scenario: End-to-end check against a phone
- **WHEN** `vm/e2e/cloud.sh` runs relay-only against a token minted by the Android host, while the Terminal app is not running
- **THEN** every step passes, the same as against a Mac host

#### Scenario: Remote stop is refused
- **WHEN** a client runs `azula vm stop default` against an Android host
- **THEN** it gets error `unsupported`, and the VM keeps running until the user stops hosting on the phone

### Requirement: Android Guest Holds No Host Credentials
The Android host's guest VM SHALL hold no azula identity, grant, token or host credential. The broker's host key and grant store SHALL live only in the app's private storage. The guest worker SHALL be reachable only through the app's vsock bridge, which listens on a Unix socket in an app-private directory with mode 0700.

#### Scenario: Guest root finds no secrets
- **WHEN** a job with sudo searches the guest filesystem for the host key or grant store
- **THEN** nothing is found, because they never leave the app's storage

### Requirement: Android Guest Networking Through The Host
The Android host's guest SHALL have no network device. Its outbound HTTP and HTTPS SHALL go only through the host app's proxy, over vsock. Jobs SHALL receive `HTTP_PROXY`/`HTTPS_PROXY` (and the lower-case forms) pointing at it, and apt and git SHALL be configured to use it. The guest SHALL accept no inbound connections other than the worker on vsock.

#### Scenario: Package and source fetches work
- **WHEN** a job runs `sudo apt-get install -y cargo`, `git clone` of a GitHub repository, and `cargo build` with crates.io dependencies
- **THEN** all three succeed through the host proxy

### Requirement: Android Guest Clock
The Android host's guest SHALL set its clock from the network through the host proxy at boot and at least every 5 minutes, because AVF guests have no working RTC.

#### Scenario: Clock after boot and after sleep
- **WHEN** the guest boots, or resumes after the phone slept, and a job runs `date -u`
- **THEN** the time is within a few seconds of real UTC

### Requirement: One-Time VM Permission Grant On The Phone
When `MANAGE_VIRTUAL_MACHINE` or `USE_CUSTOM_VIRTUAL_MACHINE` is missing, the host feature SHALL guide the user through granting both once on the phone, through a Wireless debugging pairing code. No computer SHALL be required. Hosting SHALL NOT start without both grants, and the app SHALL say which grant is missing.

#### Scenario: First-time setup without a computer
- **WHEN** a user with Developer options enabled follows the in-app steps and enters the pairing code shown by Wireless debugging into azula's notification
- **THEN** azula holds both permissions, and hosting can start

#### Scenario: Grants persist
- **WHEN** the phone reboots or azula updates after the grant
- **THEN** both permissions are still granted and no new pairing is needed

### Requirement: Android Host Lifecycle
Hosting SHALL run in a foreground service with a visible notification that has a Stop action. The VM SHALL keep running when the app's activities are closed. Stopping hosting SHALL stop the broker and the VM. Jobs that were running when the VM stopped SHALL be reported as `interrupted` after the next start.

#### Scenario: UI closed
- **WHEN** the user swipes azula away from recents while hosting
- **THEN** the VM and broker keep running, and clients keep working
