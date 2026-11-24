## ADDED Requirements

### Requirement: Bounded Guest Stdin Memory
The guest worker SHALL keep at most a fixed amount of a job's unread stdin in memory, and SHALL deliver all of it to the child in order. A child that does not read its stdin SHALL NOT delay a `cancel` frame or the disconnect that cancels a job. If the worker cannot keep the unread stdin, it SHALL cancel the job with reason `stdin_lost`.

#### Scenario: Slow child, large input
- **WHEN** a client sends a job 24 MiB of stdin and the child starts reading one second later
- **THEN** the child reads every byte, in order, and the worker's memory does not grow with the input

#### Scenario: Cancel behind unread input
- **WHEN** a client sends more stdin than the child will read and then sends `cancel`
- **THEN** the job ends with reason `cancelled` within a few seconds
