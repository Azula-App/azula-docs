## Purpose

Defines the `@azula-app/openclaw` channel plugin: how an OpenClaw gateway
reaches a phone through azula instead of a third-party messenger, covering
channel identity and configuration, the single bridge session it owns, the
outbound text/attachment/interactive-surface mapping, inbound event
translation, typing, pairing, and recovery behavior.

## ADDED Requirements

### Requirement: Channel Registration and Configuration

The plugin SHALL register a channel whose id is `azula`, so that the gateway
treats it as a first-class channel everywhere built-in channels appear —
onboarding, `channels add`, routing, access groups, and per-channel policy.
Its account configuration SHALL live under `channels.azula` and SHALL be
validated by a schema published in the plugin manifest, so an invalid
configuration is rejected before the runtime loads rather than at first
message.

Configuration SHALL identify the target device by its azula device name or
endpoint id, and SHALL allow overriding the path to the `azula` binary and the
session label announced to the phone. Multiple accounts SHALL be supported,
each addressing a distinct device.

#### Scenario: Channel offered during onboarding

- **WHEN** an operator runs `openclaw channels add` with the plugin installed
- **THEN** `azula` is offered alongside the built-in channels, and selecting it
  prompts for the device to target

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

### Requirement: One Bridge Session Per Account

Each configured account SHALL own exactly one long-lived `azula mcp` stdio
session for the lifetime of the channel, used for both outbound and inbound
traffic. The plugin SHALL NOT open a second azula session for the inbound
direction.

The session SHALL announce a stable operator-configurable label (default
`OpenClaw`) and SHALL be a named persistent session, so the conversation on
the phone keeps its identity and history across gateway restarts rather than
appearing as a new conversation each time.

#### Scenario: One conversation on the phone

- **WHEN** the gateway sends a message and the user replies
- **THEN** both directions appear in a single conversation on the phone, titled
  with the configured label

#### Scenario: Gateway restart preserves the conversation

- **WHEN** the gateway is restarted and the channel starts again
- **THEN** the phone shows the same conversation continuing, not a new one
  alongside the old

### Requirement: Outbound Text Delivery

The channel's outbound text path SHALL deliver a gateway message to the
configured device as an azula chat message, and SHALL return an identifier the
gateway can correlate with later activity.

Because azula's delivery chain falls back to the identity's relay and then to a
local queue when the device is unreachable, a message accepted for queued
delivery SHALL be reported to the gateway as sent, not as a failure. Only a
delivery that azula itself rejects SHALL surface as a channel send error.

#### Scenario: Phone reachable

- **WHEN** the agent produces a reply and the device is connected
- **THEN** the text arrives in the azula conversation and the send reports
  success

#### Scenario: Phone offline

- **WHEN** the agent produces a reply while the device is unreachable and azula
  queues it for later delivery
- **THEN** the send reports success rather than an error, and the message
  arrives when the device returns

#### Scenario: Delivery rejected

- **WHEN** azula rejects the send outright, for example because the configured
  device is unknown
- **THEN** the channel surfaces a send error naming the cause

### Requirement: Outbound Attachments

The channel SHALL support sending file attachments to the device, declaring its
media capability and per-message size limit to the gateway so that oversized or
unsupported media is caught before any transfer begins.

The advertised limit SHALL match azula's own 64 MiB inline transfer cap. An
attachment exceeding it SHALL be refused with an error naming the limit, and no
partial transfer SHALL be started.

#### Scenario: Image delivered inline

- **WHEN** the agent attaches an image to its reply
- **THEN** the image arrives in the azula conversation as an inline attachment

#### Scenario: Oversized attachment refused up front

- **WHEN** the agent attaches a file larger than the advertised limit
- **THEN** the channel refuses it with an error naming the limit and sends no
  transfer frames

### Requirement: Interactive Surfaces for Structured Choices

When an outbound message carries a structured set of choices — an approval, a
selection, or a form — the channel SHALL render it as an A2UI surface on the
device rather than flattening it to text, and SHALL include a text fallback in
the same turn so the message remains readable if the surface cannot be shown.

A tap or submission on that surface SHALL be delivered back to the gateway as
an inbound event correlated with the message that created the surface. A
surface SHALL be removed once its choice has been resolved or its turn has
ended, so stale controls do not accumulate in the conversation.

#### Scenario: Approval rendered as buttons

- **WHEN** the agent asks for approval with a discrete set of options
- **THEN** the options appear as interactive controls in the azula
  conversation, and the accompanying text describes the same choice

#### Scenario: Tap returns as the user's answer

- **WHEN** the user taps one of the rendered options
- **THEN** the gateway receives that choice as the user's reply to the message
  that asked, and the agent's turn continues

#### Scenario: Surface cleaned up after resolution

- **WHEN** a choice has been answered or its turn has ended
- **THEN** the surface is removed from the conversation

#### Scenario: Surface cannot be shown

- **WHEN** the device cannot display the surface
- **THEN** the text fallback still conveys the question and the turn does not
  stall

### Requirement: Inbound Event Translation

The plugin SHALL consume azula's structured inbound events and translate each
into an inbound envelope for the gateway carrying, at minimum, the sending
device's identity, the conversation route, and the event's own content.

Translation SHALL be type-directed, not derived from parsing rendered text:

- a chat message SHALL become a text message envelope;
- an interactive-surface event SHALL become the correlated answer described
  above, carrying its payload intact;
- a received file SHALL become an inbound message with ordered media facts
  describing the attachment;
- connection and disconnection events SHALL update the channel's liveness state
  and SHALL NOT be dispatched to the agent as user messages.

A user whose message text happens to resemble a surface event or a file notice
SHALL be delivered as ordinary text.

#### Scenario: Plain reply reaches the agent

- **WHEN** the user types a reply in the azula conversation
- **THEN** the gateway dispatches it to the agent as a text message from that
  device

#### Scenario: Inbound attachment carries media facts

- **WHEN** the user sends a file from the phone
- **THEN** the gateway receives an inbound message whose media facts describe
  the attachment, in the order received

#### Scenario: Connection events are not user messages

- **WHEN** the device disconnects and later reconnects
- **THEN** the channel's liveness state updates and the agent is not woken with
  a user message for either event

#### Scenario: Text resembling an event is treated as text

- **WHEN** the user literally types text in the shape of a surface-event or
  received-file line
- **THEN** it is dispatched as ordinary message text, not interpreted as an
  event

### Requirement: Inbound Delivery Is Ordered and Not Duplicated

Inbound events SHALL be dispatched in the order azula reported them, and each
event SHALL be dispatched at most once. A restart of the plugin or its bridge
session SHALL NOT replay events that were already dispatched, and SHALL NOT
silently drop events that were drained but not yet dispatched.

#### Scenario: Ordering preserved

- **WHEN** the user sends several messages in quick succession
- **THEN** the agent receives them in the order they were sent

#### Scenario: Restart does not duplicate

- **WHEN** the bridge session is restarted after events have been dispatched
- **THEN** those events are not delivered to the agent a second time

### Requirement: Typing Indicator During Agent Turns

The channel SHALL expose a typing capability that puts the azula conversation
into its thinking state while the agent is working, and SHALL clear that state
when the turn produces a reply or ends without one.

The indicator SHALL NOT remain set indefinitely: if a turn ends abnormally, the
thinking state SHALL still be cleared.

#### Scenario: Long turn shows activity

- **WHEN** the agent begins a turn that takes noticeable time before producing
  text
- **THEN** the azula conversation shows the thinking state until the reply
  arrives

#### Scenario: Failed turn clears the indicator

- **WHEN** a turn ends with an error and no reply
- **THEN** the thinking state is cleared rather than left on

### Requirement: Access Control Reuses azula Pairing

The channel SHALL treat azula's own device pairing as its access boundary:
inbound traffic SHALL be accepted only from a device the machine identity is
paired with and that the account is configured to serve. The plugin SHALL NOT
define a second, independent allowlist keyed on chat identifiers.

Pairing SHALL be surfaced through the channel's pairing affordance by
presenting azula's own invite — its URL and scannable code — so an operator
pairs once, with azula, rather than completing a separate channel pairing
handshake.

#### Scenario: Unpaired device ignored

- **WHEN** traffic arrives from a device the machine is not paired with
- **THEN** it is not dispatched to the agent

#### Scenario: Pairing presents the azula invite

- **WHEN** an operator starts pairing for the channel
- **THEN** they are shown azula's invite URL and scannable code to complete on
  the phone

### Requirement: Missing Prerequisites Fail Clearly

When the `azula` binary is absent from the gateway's environment, or the
machine has no identity paired with the configured device, the channel SHALL
report a configuration error naming the missing prerequisite and the action
that fixes it.

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
  pair, rather than failing per message

### Requirement: Bridge Session Recovery

If the bridge session exits or becomes unusable while the channel is running,
the plugin SHALL re-establish it automatically using a backoff that does not
spin, and SHALL resume both directions once it is back.

An outbound send attempted while the session is down SHALL either be delivered
after recovery or reported as a send error; it SHALL NOT be silently dropped.
Repeated failure to recover SHALL be surfaced as a channel health problem
rather than being retried in silence.

#### Scenario: Session crash recovers

- **WHEN** the bridge session exits unexpectedly
- **THEN** the plugin re-establishes it with backoff and inbound and outbound
  traffic resume

#### Scenario: Send during an outage is not lost silently

- **WHEN** the agent sends a reply while the session is down
- **THEN** the reply is either delivered after recovery or reported as a send
  error

#### Scenario: Persistent failure surfaces

- **WHEN** recovery keeps failing past the backoff ceiling
- **THEN** the channel reports an unhealthy state naming the cause
