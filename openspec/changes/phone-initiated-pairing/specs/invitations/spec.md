## ADDED Requirements

### Requirement: Invite Gate Spans Every Accepted ALPN
The accept gate's invite verification path SHALL apply to every ALPN an
acceptor answers, not to the peer-chat ALPN alone. A stranger presenting a
valid invite SHALL be gated identically whether it arrives on the chat, agent,
or terminal ALPN. An acceptor SHALL NOT close a stranger's connection on the
basis of its ALPN before the invite has been evaluated.

A stranger that presents no invite, or one that fails verification, and that
is not admitted by the session-certificate path SHALL still be closed on the
agent and terminal ALPNs.

#### Scenario: Invite-bearing stranger on the agent ALPN
- **WHEN** a stranger presenting a valid invite connects on the agent ALPN
- **THEN** the invite SHALL be verified and the connection gated exactly as it
  would be on the chat ALPN, rather than closed unread

#### Scenario: Invite-less stranger on the agent ALPN is still closed
- **WHEN** a stranger with no invite and no admitting certificate connects on
  the agent or terminal ALPN
- **THEN** the connection SHALL be closed

#### Scenario: Failed certificate check reaches the invite path on every ALPN
- **WHEN** a stranger's session-certificate check fails on the agent or
  terminal ALPN and its `Hello` carries a valid invite
- **THEN** the connection SHALL fall through to invite verification and be
  admitted or gated on the invite's merits

## MODIFIED Requirements

### Requirement: Pending Requests and Consumption
On the app, a stranger presenting a valid invite SHALL become a persisted pending request rather than an active conversation, until the user explicitly accepts or declines. Accepting SHALL add the peer to contacts — recording the root public key as the contact identifier when the stranger presented a valid device certificate, and the endpoint id otherwise — and, if the invite is single-use, mark it consumed. Declining SHALL close the connection and discard the pending request. On the CLI, verification success SHALL constitute acceptance and SHALL register the device (with its root key when certified) immediately, with no pending step.

A new connection from an endpoint that already has a pending request SHALL
replace that request's held stream, preserving the request's invite id, peer
code, and position in the queue, rather than being refused. The user SHALL
continue to see one request for that endpoint, and accepting it SHALL wire the
most recent stream.

#### Scenario: User declines a pending stranger
- **WHEN** the user declines a pending request from a stranger who
  presented a valid invite
- **THEN** the connection SHALL be closed and no contact or conversation
  SHALL be created

#### Scenario: Accepting a certified stranger pins the root
- **WHEN** the user accepts a pending stranger whose `Hello` carried a valid certificate
- **THEN** the contact is recorded by root public key, and that identity's other certified devices are subsequently known

#### Scenario: Redeemer reconnects while awaiting approval
- **WHEN** a redeemer whose request is still pending reconnects and
  re-presents its invite
- **THEN** the existing pending request SHALL adopt the new stream instead of
  the connection being closed, and no second request SHALL appear

#### Scenario: Accepting after a reconnect wires the live stream
- **WHEN** the user accepts a pending request whose stream has been replaced
  by a reconnect
- **THEN** the conversation SHALL be wired to the current live stream, not the
  superseded one
