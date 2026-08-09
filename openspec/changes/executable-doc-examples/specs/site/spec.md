## ADDED Requirements

### Requirement: Published shell examples are executable or explicitly illustrative

Every fenced shell block the site publishes SHALL either be executable — byte-identical to the region of a script that runs against a real `azula` binary and asserts the claim its page makes — or be recorded in an allowlist with a stated reason it cannot run. A block that is neither SHALL fail the documentation check, so an unverified snippet cannot be added silently.

The allowlist SHALL key each entry by the block's content hash rather than its
location, so that moving a block is inert but editing one invalidates its entry
and forces the reason to be re-examined.

#### Scenario: A block is executable

- **WHEN** a fenced `sh` block is tagged as an example
- **THEN** its text SHALL be byte-identical to the region the corresponding
  script executes, and the check SHALL fail if the two diverge by so much as a
  character

#### Scenario: A block cannot be executed

- **WHEN** a snippet demonstrates something unrunnable unattended, such as a
  command that binds an iroh endpoint or installs software
- **THEN** it SHALL carry an allowlist entry naming the page and the reason,
  and SHALL still be covered by the lint and CLI-surface checks

#### Scenario: A new untagged block is added

- **WHEN** a contributor adds a fenced `sh` block that is neither tagged nor
  allowlisted
- **THEN** the check SHALL fail and report the content hash needed to record it

#### Scenario: An allowlisted block is edited

- **WHEN** the text of an allowlisted block changes
- **THEN** its entry SHALL no longer match and the check SHALL fail, so the
  stated reason is reconsidered rather than inherited

### Requirement: Documented invocations match the CLI's own surface

Every `azula` invocation the site publishes SHALL name a subcommand, flag and flag value that the binary reports in its own help output. This SHALL cover invocations wherever they appear — inside a fenced block, in an inline code span, or in the command-reference table, whose bracketed-optional and alternation notation SHALL be interpreted rather than skipped.

#### Scenario: A documented flag is renamed in the CLI

- **WHEN** the CLI renames or removes a flag, subcommand, or flag value that
  the site documents
- **THEN** the check SHALL fail, naming the page, the line, and what the binary
  actually accepts

#### Scenario: A command is documented only in the reference table

- **WHEN** an invocation appears solely as a table row such as
  `azula terminal [new|list|attach|kill]`
- **THEN** each alternative SHALL be validated as a real subcommand, and each
  bracketed flag as a real flag

### Requirement: Examples run offline and leave no trace

An executable example SHALL invoke only commands that bind no iroh endpoint, because the CLI's networked paths await a relay connection with no timeout and would hang rather than fail. Each example SHALL confine all state to a temporary workspace, leaving the reader's own identity, device registry and sessions untouched.

#### Scenario: An example would need the network

- **WHEN** a proposed example invokes a command that binds an endpoint, such as
  `azula mcp` or `azula message send`
- **THEN** it SHALL NOT be made executable, and the block SHALL be allowlisted
  instead

#### Scenario: An example runs on a machine with real azula state

- **WHEN** the example suite runs on a machine with an existing `~/.azula`
- **THEN** that directory SHALL be byte-identical afterwards, and no temporary
  workspace SHALL remain

#### Scenario: An example needs a project-scoped registry

- **WHEN** an example demonstrates the project-versus-global registry
  precedence
- **THEN** it SHALL achieve isolation through `HOME` and the working directory
  rather than the registry path override, which collapses the two registries
  and would bypass the very behaviour being demonstrated
