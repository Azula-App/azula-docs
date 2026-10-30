## MODIFIED Requirements

### Requirement: Stable Bridge Identity
The bridge SHALL derive its connectivity from the session-identity model: a stable machine identity key persisted at `~/.azula/machine.key` (adopting a pre-existing `~/.azula/bridge.key` unchanged, so pairing codes survive the migration) SHALL sign a per-process session certificate, and each bridge process SHALL bind its own session keypair rather than the machine key. `start_pairing` SHALL mint invites against the identity of the endpoint that accepts the resulting dial — the session — and the machine identity SHALL remain the identity a phone pairs *with*, carried by the session certificate rather than by the invite's ticket. A phone SHALL therefore pair with the machine once, not with an individual session: accepting any one session's invite pins that session's certificate root, and every later session of the same machine is admitted without a further invite.

An invite SHALL NOT advertise an endpoint that the issuing process is not accepting on.

The name a session announces to peers SHALL be the operator-supplied label when one is given, and SHALL fall back to a name derived from the session's own endpoint id otherwise. Every command that establishes a session SHALL honour that label; a command that cannot apply it SHALL reject it rather than accept and discard it.

#### Scenario: Labelled one-shot session
- **WHEN** a one-shot command such as `azula message send` is run with a session name supplied
- **THEN** the peer titles the conversation with that label instead of the endpoint-id-derived default

#### Scenario: Unlabelled session keeps a stable default
- **WHEN** no label is supplied
- **THEN** the session announces the endpoint-id-derived default name, unchanged from today

#### Scenario: Minted invite is reachable
- **WHEN** a bridge mints a pairing invite
- **THEN** the endpoint named by the invite's ticket SHALL be one the bridge is accepting connections on, and SHALL be able to verify that invite when it is presented back

#### Scenario: Restart preserves pairing
- **WHEN** a bridge restarts and mints a fresh pairing invite under a new session identity
- **THEN** a phone already paired with that machine SHALL need no re-pairing, because the new session's certificate chains to the same machine root

#### Scenario: Concurrent bridges do not collide
- **WHEN** two bridge processes run concurrently on one machine
- **THEN** each binds a distinct certified session key and both hold working conversations with the phone simultaneously
