## ADDED Requirements

### Requirement: Global Options Apply or Are Rejected
An option the CLI accepts at the top level SHALL either take effect for the
command being run or be rejected with an error naming it. The CLI SHALL NOT
accept a top-level option and silently discard it, which is the failure mode
produced by flattening a subcommand's argument group into the root parser
while reading it on only one code path.

Where a subcommand defines an option of its own that shares a name with a
global, the subcommand's meaning SHALL win, so that an established
invocation does not change meaning when a global is introduced.

#### Scenario: Session label reaches a one-shot verb
- **WHEN** a session label is supplied at the top level to a verb that
  establishes a session
- **THEN** the verb applies it rather than discarding it

#### Scenario: Inapplicable global is rejected
- **WHEN** a top-level option is supplied to a verb that cannot apply it
- **THEN** the CLI exits with an error naming the option, rather than
  succeeding as though it had been honoured

#### Scenario: Subcommand option keeps its own meaning
- **WHEN** `azula pair --name <name>` is run, where `--name` also exists as a
  global with a different meaning
- **THEN** `--name` names the device being paired, as it does today
