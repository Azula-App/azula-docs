# terminal — delta

## ADDED Requirements

### Requirement: Run Wrapper With Failure Handoff
`azula run [--handoff on-error|always|never] -- <command…>` SHALL execute the command in a PTY it captures (mirroring output to the real stdout/stderr so CI logs are unchanged) while feeding the persistent-session ring buffer. On the handoff trigger (nonzero exit for `on-error`; startup for `always`), it SHALL keep the session's captured output, spawn `$SHELL` in the same session with the same working directory and environment, and print a connect block (the session's invite URL and QR when no machine key exists; a session identifier plus a relayed attach notification when one does). The process SHALL stay alive until the handoff session ends or a `--hold` timeout (default 60 minutes) expires, then exit with the original command's exit code.

#### Scenario: CI failure hands off with scrollback
- **WHEN** a wrapped CI command exits nonzero with `--handoff on-error`
- **THEN** the job log shows the connect block, and a client that attaches sees the failed command's output followed by a live shell prompt in the same cwd

#### Scenario: Success passes through untouched
- **WHEN** the wrapped command exits zero under `--handoff on-error`
- **THEN** `azula run` exits immediately with code 0 and no connect block is printed

#### Scenario: Exit code is preserved after handoff
- **WHEN** the held session ends (or `--hold` expires) after a failure handoff
- **THEN** `azula run` exits with the wrapped command's original nonzero exit code

### Requirement: Named Detached Terminal Sessions
`azula terminal new [--cmd <command>] [--name <name>]` SHALL spawn a detached background process hosting one persistent terminal session under its own session identity, recording a runtime state file; `azula terminal list` SHALL enumerate such sessions with name, pid, and connection state; `azula terminal kill <name>` SHALL terminate one. Any number of sessions SHALL be able to run concurrently.

#### Scenario: Spin up several remote-controlled programs
- **WHEN** the user runs `azula terminal new --cmd "claude" --name work` and again with `--name experiments`
- **THEN** two detached sessions run concurrently, each attachable from the phone as its own conversation, and `azula terminal list` shows both

### Requirement: CLI Terminal Attach Client
`azula terminal attach <name|url>` SHALL attach the invoking terminal to a hosted session as a raw passthrough client (PTY bytes to the local terminal, local keystrokes back, resize propagation), so a session started elsewhere — a CI handoff or a detached session — can be continued from a shell as well as from the phone.

#### Scenario: Continue a CI session from a laptop shell
- **WHEN** a user runs `azula terminal attach <invite-url>` with the URL from a CI handoff block
- **THEN** their terminal shows the replayed scrollback and a live prompt in the CI environment

### Requirement: Invite-Authorized Session Attach
A hosted session SHALL admit an attach from the session's creating peer or from a client redeeming that session's own invite; `term_attach` from any other peer SHALL receive a fresh session rather than the held one, preserving today's owner-binding for all other cases.

#### Scenario: Invite redemption grants the held session
- **WHEN** a client dials with the session's invite and sends `term_attach` for it
- **THEN** it is attached to the held session with replay, even though it is not the creating peer

#### Scenario: Unrelated peer still gets a fresh session
- **WHEN** a peer without the invite and without owner status sends `term_attach` naming the held session
- **THEN** it silently receives a fresh session, as before this change
