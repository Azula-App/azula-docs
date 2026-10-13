## ADDED Requirements

### Requirement: The App Redials a Session Conversation
The app SHALL redial an offline session conversation itself, by the session's endpoint id (its `device_pk`, which keys the conversation), rather than relying on the session alone to reconnect. It SHALL do so when the conversation's stream drops and when the user opens the conversation, with the same bounded backoff an ordinary dialed conversation gets, and for every offline session conversation at once when the transport binds or re-binds and when the app returns to the foreground, with a shorter budget since many of those sessions may have exited for good. It SHALL NOT redial a session conversation that is disabled (archived) or whose stored certificate expiry has passed. On every such redial the session's answering `Hello` SHALL carry a session certificate that passes the same checks an inbound reconnect's does — signature, expiry, session flag, a still-paired machine root, and a `device_pk` equal to the dialed endpoint — or the connection is closed and the conversation stays offline; a certificate that passes SHALL replace the stored expiry. A terminal session SHALL be left to its host's own reconnect, since a terminal host answers a dial with no `Hello` to re-validate.

#### Scenario: Dropped session comes back without the session redialing
- **WHEN** a session conversation's connection drops while the session process keeps running
- **THEN** the app dials the session by its endpoint id with backoff, and the conversation is back online once the session answers with a valid session certificate

#### Scenario: Resuming the app brings a session back
- **WHEN** the app returns to the foreground with a session conversation offline
- **THEN** the app dials that session without waiting for the session's own redial

#### Scenario: Expired or archived session is not redialed
- **WHEN** a session conversation's stored certificate expiry has passed, or the conversation is disabled
- **THEN** no trigger dials it

#### Scenario: A certificate that no longer validates is refused
- **WHEN** the app redials a session and the session answers with a certificate that is expired, lacks the session flag, or names a machine root that is no longer a paired contact
- **THEN** the app closes the connection, leaves the conversation offline, and stops that redial loop

#### Scenario: A restarted named session renews its expiry
- **WHEN** the app redials a named session that restarted and minted a fresh certificate
- **THEN** the conversation comes back online and its stored expiry becomes the fresh certificate's
