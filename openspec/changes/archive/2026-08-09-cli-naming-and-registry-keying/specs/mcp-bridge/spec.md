## MODIFIED Requirements

### Requirement: Device Registry Precedence
Paired devices SHALL be recorded (name, ticket, added-at timestamp) in a
project-local registry and/or a global registry. A registry row SHALL be
identified by the endpoint id its `ticket` resolves to — for either stored
ticket shape, a dialable `EndpointTicket` string or a bare endpoint-id hex
string — and NOT by its display name. Writing a device SHALL replace the row
with the same endpoint id and SHALL NOT replace a row belonging to a
different endpoint id, whatever the two are named. Rows whose ticket does not
resolve to an endpoint id SHALL fall back to name equality, so a
hand-edited registry stays editable.

Display name SHALL remain unique within the merged view, since it is the
handle every device-targeting verb resolves against. When a device is written
whose derived name is already taken by a different endpoint id, the CLI SHALL
disambiguate the new row's name rather than overwrite or reject.

Reads SHALL merge global-then-project, with the project registry taking
precedence when both hold the same endpoint id (or, for unresolvable rows,
the same name). Forgetting a device SHALL remove it from both registry files,
not only from the in-memory device map.

#### Scenario: Two devices paired from invites do not collide
- **WHEN** two phones are paired from separate invites, neither with an
  explicit `--name`
- **THEN** the registry holds two rows, one per endpoint id, and neither
  pairing removes or overwrites the other

#### Scenario: Re-pairing a renamed device updates its own row
- **WHEN** a device the user renamed by hand is paired again from a fresh
  invite, so its ticket text differs but its endpoint id is the same
- **THEN** that row is updated in place rather than duplicated, and no row
  belonging to another endpoint id is touched

#### Scenario: Same endpoint id in both registries
- **WHEN** an endpoint id has a row in both the global and project registry
- **THEN** the merged view uses the project registry's entry for that device

#### Scenario: Unresolvable rows still merge by name
- **WHEN** a registry row's ticket cannot be resolved to an endpoint id
- **THEN** it is matched and merged by name as before, and remains readable
  and forgettable

#### Scenario: Forget removes from both stores
- **WHEN** `disconnect` is called with `forget=true`
- **THEN** the device is deleted from the project registry and the global
  registry, not only from the in-memory map

### Requirement: Pairing Ticket Forms and Peer Naming
Ticket parsing SHALL accept four interchangeable input forms: the `/s/`
web URL, the `/connect/` web URL, the `azula://connect?code=` deep link, or a
bare token. On accepting a connection, the bridge SHALL name the peer using,
in priority order: (1) a endpoint-id match against a known device in the
registry, (2) the `Hello{name}` frame the peer sent, (3) a generated
fallback name. Every accepted app connection (not peer-bridge connection)
SHALL receive a `Hello{name: own_name}` frame in reply.

When `azula pair` registers a device without an explicit `--name`, the
default name SHALL be derived from the endpoint id decoded from the ticket —
its first 8 hex characters — and SHALL NOT be derived from the ticket's
serialized text, whose leading characters are constant for a given ticket
format and therefore identical across devices. A ticket whose endpoint id
cannot be decoded SHALL fail pairing with an error naming the ticket, rather
than fall back to a derivation that may collide.

#### Scenario: Invite-derived pairings get distinct default names
- **WHEN** two devices are paired from `https://azula.app/i/…` invites with
  no `--name`
- **THEN** each is named from its own endpoint id, and neither is named after
  the ticket format's constant prefix

#### Scenario: Undecodable ticket fails loudly
- **WHEN** `azula pair` is given a ticket whose endpoint id cannot be decoded
- **THEN** pairing fails with an error identifying the ticket, and no
  registry row is written

#### Scenario: Reconnecting device with a stale Hello name
- **WHEN** a device with a known registry ticket reconnects but announces a
  different `Hello` name
- **THEN** the bridge names it via the endpoint-id match against the registry,
  not the freshly announced (possibly stale) `Hello` name

#### Scenario: App connection receives a naming reply
- **WHEN** an app (not a peer bridge) connects and is accepted
- **THEN** the bridge sends back `Hello{name: own_name}` so the phone can
  title the conversation

### Requirement: Stable Bridge Identity
The bridge SHALL derive its connectivity from the session-identity model: a stable machine identity key persisted at `~/.azula/machine.key` (adopting a pre-existing `~/.azula/bridge.key` unchanged, so pairing codes survive the migration) SHALL sign a per-process session certificate, and each bridge process SHALL bind its own session keypair rather than the machine key. `start_pairing` SHALL mint invites for the machine identity so a phone pairs with the machine once, not with an individual session.

The name a session announces to peers SHALL be the operator-supplied label when one is given, and SHALL fall back to a name derived from the session's own endpoint id otherwise. Every command that establishes a session SHALL honour that label; a command that cannot apply it SHALL reject it rather than accept and discard it.

#### Scenario: Labelled one-shot session
- **WHEN** a one-shot command such as `azula message send` is run with a session name supplied
- **THEN** the peer titles the conversation with that label instead of the endpoint-id-derived default

#### Scenario: Unlabelled session keeps a stable default
- **WHEN** no label is supplied
- **THEN** the session announces the endpoint-id-derived default name, unchanged from today

#### Scenario: Restart preserves pairing code
- **WHEN** the machine's pairing invite is regenerated after a restart
- **THEN** it still names the same machine identity, so a previously paired phone needs no re-pairing

#### Scenario: Concurrent bridges do not collide
- **WHEN** two bridge processes run concurrently on one machine
- **THEN** each binds a distinct certified session key and both hold working conversations with the phone simultaneously
