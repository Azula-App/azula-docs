## ADDED Requirements

### Requirement: Bounded Guest Stdin Memory
The guest worker SHALL keep at most a fixed amount of a job's unread stdin in memory, and SHALL deliver all of it to the child in order. A child that does not read its stdin SHALL NOT delay a `cancel` frame or the disconnect that cancels a job. If the worker cannot keep the unread stdin, it SHALL cancel the job with reason `stdin_lost`.

#### Scenario: Slow child, large input
- **WHEN** a client sends a job 24 MiB of stdin and the child starts reading one second later
- **THEN** the child reads every byte, in order, and the worker's memory does not grow with the input

#### Scenario: Cancel behind unread input
- **WHEN** a client sends more stdin than the child will read and then sends `cancel`
- **THEN** the job ends with reason `cancelled` within a few seconds

### Requirement: Transfers Act As The Job User
Where the guest worker runs as root with `--run-as`, it SHALL perform every operation on a put's or get's target, part file and parent directories with the run-as user's filesystem credentials and no effective capabilities, and SHALL open a job's `cwd` as that user. If it cannot take those credentials it SHALL fail the request, never fall back to its own. The worker's own records and the state directory SHALL remain the worker's, unreadable to the run-as user.

#### Scenario: Root-only target
- **WHEN** a client pushes a file to a directory that only root may write, such as `/root`
- **THEN** the transfer fails with `io_error` naming the permission error, and nothing is created there

#### Scenario: A transfer's files belong to the job user
- **WHEN** a client pushes a file with missing parent directories into the job user's home
- **THEN** the file and the directories are owned by the job user, and the same client can pull the file back

#### Scenario: A job's working directory
- **WHEN** a job asks for a `cwd` the run-as user can't enter
- **THEN** it ends with `cwd_missing` before it starts
