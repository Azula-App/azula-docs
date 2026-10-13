## ADDED Requirements

### Requirement: A Reply Is Never Dropped Silently

Every reply the gateway hands the channel — a streamed block, a final, a
proactive send — SHALL reach the phone as at least text whenever it carries
any content: its text, or failing that its fallback text, the text rendering
of its presentation or interactive controls, a location, or a link to an
attachment that could not be sent. Core's presentation fallback SHALL be
applied on every path, including replies to inbound messages, where the
gateway does not apply it itself.

A reply with content the channel cannot show at all SHALL be logged as a
warning naming the kinds of content it carried (not the content itself).

#### Scenario: Presentation-only reply

- **WHEN** the agent replies with a presentation and no plain text
- **THEN** the phone receives the presentation's text rendering

#### Scenario: Reply the channel cannot show

- **WHEN** a reply carries only content the channel cannot render
- **THEN** a warning naming that content's kinds is logged rather than the
  reply vanishing without trace

## MODIFIED Requirements

### Requirement: Outbound Text Delivery

The channel's outbound text path SHALL deliver a gateway message to the
configured device as an azula chat message, and SHALL return an identifier the
gateway can correlate with later activity. A reply's text SHALL be sent first,
immediately and as its own message, before any attachment or surface, so that
nothing that follows can delay or lose it.

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

#### Scenario: Text is not held back by an attachment

- **WHEN** a reply carries text and an attachment that is slow or fails
- **THEN** the text arrives at once, and the attachment's outcome follows it

### Requirement: Outbound Attachments

The channel SHALL support sending file attachments to the device, declaring its
media capability and per-message size limit to the gateway so that oversized or
unsupported media is caught before any transfer begins.

The advertised limit SHALL match azula's own 64 MiB inline transfer cap. An
attachment exceeding it SHALL be refused with an error naming the limit, and no
partial transfer SHALL be started.

An attachment given as a remote http(s) URL SHALL be fetched through the
gateway's guarded media loader — which refuses private and loopback addresses
and bounds size and time — and then sent like a local file. One that cannot be
fetched or sent SHALL reach the phone as a link in a follow-up message rather
than failing the reply.

#### Scenario: Image delivered inline

- **WHEN** the agent attaches an image to its reply
- **THEN** the image arrives in the azula conversation as an inline attachment

#### Scenario: Remote image fetched

- **WHEN** the agent's reply references an image by a public https URL
- **THEN** the reply's text arrives, followed by the image as an inline
  attachment

#### Scenario: Remote image unavailable

- **WHEN** a referenced remote attachment cannot be fetched
- **THEN** the reply's text still arrives, followed by the attachment's link

#### Scenario: Oversized attachment refused up front

- **WHEN** the agent attaches a file larger than the advertised limit
- **THEN** the channel refuses it with an error naming the limit and sends no
  transfer frames

### Requirement: Interactive Surfaces for Structured Choices

When an outbound message carries tappable choices — buttons whose action is a
callback, a command or an answer to a question, or a selection — the channel
SHALL render them as an A2UI surface on the device after the message's text,
and the text SHALL list every control so the message remains complete if the
surface cannot be shown. Controls that cannot be acted on by a tap here (links,
approvals, model pickers, disabled buttons) SHALL appear in the text only, and
a surface SHALL be rendered only when there is something to tap.

A control whose hidden value the gateway would treat as a command — a slash
command, an inline command shortcut, or an abort word — SHALL NOT be rendered
as a button unless the control is itself a command, whose command the text
shows. A tap must never do something the user could not see.

A tap or submission on that surface SHALL be delivered back to the gateway as
an inbound event correlated with the message that created the surface. A
surface SHALL be removed once its choice has been resolved or its turn has
ended, so stale controls do not accumulate in the conversation. The channel
SHALL declare these capabilities to the gateway, so the agent knows it may
offer such choices on this channel.

#### Scenario: Approval rendered as buttons

- **WHEN** the agent asks the user to choose among a discrete set of options
  offered as callback, command or question buttons
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

#### Scenario: Hidden command not tappable

- **WHEN** a control is not a command but its hidden value is one the gateway
  would act on as a command (for example `/reset`, a `!` shortcut, or `stop`)
- **THEN** it is listed in the text but not rendered as a button
