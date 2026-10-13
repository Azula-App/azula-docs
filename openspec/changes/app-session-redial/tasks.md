## 1. Dial a session by id

- [x] 1.1 `IrohTransport.connectById(endpointId, alpn)` with a failing default;
      implement it in `IrohFfiTransport` and `IosIrohTransport` over iroh-kmp's
      `IrohEndpoint.connectById(…).openBi()`
- [x] 1.2 `redialSession`: dial by id on the conversation kind's ALPN, send our
      `Hello`, require the session's answering `Hello` cert to pass
      `checkSessionCert`, refresh `sessionExpiresAt`, wire with `replace = false`;
      a silent hang-up is retried, a failing cert ends the loop

## 2. Hook every trigger

- [x] 2.1 `scheduleReconnect` redials a ticket-less session conversation that is
      enabled, unexpired, and not a terminal, re-checking expiry each attempt;
      covers the stream drop and opening the conversation
- [x] 2.2 `reconnectSessions` (2 attempts each) on transport (re)bind and on the
      foreground false→true edge

## 3. Verify

- [x] 3.1 Tests: drop → redial by id on the admitted ALPN; frames after the
      session's `Hello` reach the conversation; expiry refreshed; expired cert
      refused and not retried; silent hang-up retried; full backoff gives up
      after 8; expired, disabled and terminal sessions never dialed; opening,
      foreground and re-bind each redial; foreground budget is 2; an
      invite-accepted inbound peer is still never redialed
- [x] 3.2 `./check` passes for `network-api`, `network-real`, `shared`,
      `mock-support`
- [ ] 3.3 On a phone, after the next app release: background the app until the
      OpenClaw conversation on houston drops, restart the session, and
      confirm the conversation comes back online on resume without anything
      being sent
