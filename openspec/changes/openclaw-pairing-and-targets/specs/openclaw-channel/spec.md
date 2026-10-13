## ADDED Requirements

### Requirement: Proactive Sends Reach the Account's Phone

The channel SHALL resolve an outbound target — the paired device's name, or
that name prefixed `azula:` — to the direct conversation of the account that
owns the device, so that every proactive path the gateway offers reaches the
phone: `openclaw message send`, the agent's own message tool, and scheduled or
heartbeat delivery. An explicit account selection SHALL be respected. A
proactive send SHALL be carried by the gateway's running account, since only it
holds the session.

A target that resolves to no account's device SHALL fail naming the device the
account is paired with and how to address it, and a device owned by another
account SHALL fail naming that account. Scheduled and heartbeat delivery SHALL
default to the account's phone when no destination is given.

#### Scenario: Operator messages the phone from the gateway host

- **WHEN** an operator runs `openclaw message send --channel azula --target
  <device>` while the account is running
- **THEN** the message arrives in the phone's conversation for that account

#### Scenario: Unknown target

- **WHEN** a send names a target no account is paired with
- **THEN** it fails with an error naming the paired device to use instead

#### Scenario: Scheduled delivery without a destination

- **WHEN** a scheduled or heartbeat delivery to the `azula` channel gives no
  destination
- **THEN** it is delivered to the account's paired phone

## MODIFIED Requirements

### Requirement: Channel Registration and Configuration

The plugin SHALL register a channel whose id is `azula`, so that the gateway
treats it as a first-class channel everywhere built-in channels appear —
onboarding, `channels add`, routing, access groups, and per-channel policy.
Its account configuration SHALL live under `channels.azula` and SHALL be
validated by a schema published in the plugin manifest, so an invalid
configuration is rejected before the runtime loads rather than at first
message.

Configuration SHALL identify the target device by its azula device name or
endpoint id once it is known, and SHALL allow overriding the path to the
`azula` binary and the session label announced to the phone. Because a phone
that pairs by redeeming an invite is named only once it has paired, the device
SHALL be optional: an account without one SHALL start waiting for a phone to
pair (see "Access Control Reuses azula Pairing") rather than fail validation.
Multiple accounts SHALL be supported, each addressing a distinct device, and a
configuration change to one account SHALL NOT restart the others.

#### Scenario: Channel offered during onboarding

- **WHEN** an operator runs `openclaw channels add` with the plugin installed
- **THEN** `azula` is offered alongside the built-in channels

#### Scenario: Invalid configuration rejected before runtime

- **WHEN** `channels.azula` is configured with a field that violates the
  published schema
- **THEN** the gateway reports the configuration error at validation time and
  the channel does not start

#### Scenario: Two accounts address two devices

- **WHEN** two `channels.azula` accounts are configured naming different
  devices
- **THEN** each account delivers only to its own device, and inbound traffic
  from a device is attributed to the account that owns it

#### Scenario: Account configured before its phone exists

- **WHEN** an account is enabled with no device
- **THEN** it starts, holds its session, carries no agent traffic, and its
  status tells the operator how to pair

### Requirement: Access Control Reuses azula Pairing

The channel SHALL treat azula's own device pairing as its access boundary:
inbound traffic SHALL be accepted only from a device the machine identity is
paired with and that the account is configured to serve. The plugin SHALL NOT
define a second, independent allowlist keyed on chat identifiers.

Pairing SHALL be surfaced through the channel's pairing affordance —
`openclaw channels login --channel azula`, optionally naming the account — by
presenting azula's own invite, its URL and scannable code, minted by the
account's own session, so an operator pairs once, with azula, rather than
completing a separate channel pairing handshake. Because only the gateway's
running account holds that session, the invite SHALL come from the gateway;
when the account is not running, the gateway SHALL hold the session just long
enough to pair.

An account waiting for a phone SHALL adopt the first device that pairs with
and connects to *its* session — never a device paired only with another
session on the same machine — and SHALL persist it as the account's device
through the gateway's configuration, then begin serving it. Where the
configuration cannot be written, the account SHALL serve the device for the
life of the process and SHALL surface the exact command that persists it. An
account SHALL adopt at most one device; replacing it SHALL require clearing the
configured device first.

#### Scenario: Unpaired device ignored

- **WHEN** traffic arrives from a device the machine is not paired with
- **THEN** it is not dispatched to the agent

#### Scenario: Pairing presents the azula invite

- **WHEN** an operator runs `openclaw channels login --channel azula`
- **THEN** they are shown azula's invite URL and scannable code for the
  account's session, and the command waits for the phone

#### Scenario: Paired phone is adopted and persisted

- **WHEN** a phone redeems that invite while the account is waiting
- **THEN** the account saves the phone as its device and starts serving it,
  and a later gateway restart comes up serving it from configuration alone

#### Scenario: Another session's phone is not adopted

- **WHEN** a phone pairs with a different azula session on the same machine
  while an account is waiting
- **THEN** the waiting account does not adopt it

### Requirement: Missing Prerequisites Fail Clearly

When the `azula` binary is absent from the gateway's environment, or the
account names a device the machine has no pairing with, the channel SHALL
report a configuration error naming the missing prerequisite and the action
that fixes it. An account that names no device is waiting, not failing, and
SHALL NOT be reported as an error.

It SHALL NOT retry indefinitely in a tight loop, and SHALL NOT prevent the rest
of the gateway — other channels included — from starting.

#### Scenario: Binary not installed

- **WHEN** the channel starts and no `azula` binary can be run
- **THEN** the channel reports a configuration error naming the binary and how
  to install it, and other channels continue to operate

#### Scenario: No paired device

- **WHEN** the channel starts and the configured device is not paired with this
  machine
- **THEN** the channel reports a configuration error directing the operator to
  pair with `openclaw channels login --channel azula`, rather than failing per
  message, and the account starts by itself once that pairing completes
