## ADDED Requirements

### Requirement: Start Sequence Is Idempotent
The app's start sequence SHALL run at most once per process, binding at most one transport endpoint however many times it is invoked. Platforms that invoke it more than once — Android starts the state from the `Application` and again from the composition's setup gate — SHALL NOT produce a second endpoint on the same secret key.

#### Scenario: Repeated start binds once
- **WHEN** the start sequence is invoked more than once in a process
- **THEN** the transport SHALL bind exactly one endpoint, and later
  invocations SHALL have no further effect

#### Scenario: Android starts the state twice
- **WHEN** Android starts the state from the `Application` and again from the
  setup gate
- **THEN** exactly one endpoint SHALL exist, with no orphaned endpoint sharing
  the same endpoint id and no orphaned inbound accept loop
