## Why

The invite payload / connect-gate revamp shipped (see
`openspec/specs/invitations/design.md`). The gate logic itself is covered at
the service layer (`StrangerGateTest`, `InviteServiceTest`), but
`InviteReviewSheet` — the inbound accept/decline review UI — has no Compose UI
test, because `FakeTransport` can't emit an arbitrary inbound message: it only
simulates its fixed one-shot "mockterm" connection, not a generic inbound
stranger.

## What Changes

- Extend `FakeTransport` (or add a companion test seam) so it can emit an
  arbitrary inbound `IncomingConnection`, not just its fixed one-shot
  "mockterm" connection.
- Add a Compose UI test for `InviteReviewSheet` covering accept and decline,
  driven through that new seam, per `openspec/specs/testing/design.md`
  (shared-UI-behavior layer, JVM Compose suite).

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
(none — this adds test infrastructure and coverage; it does not change
`invitations` requirement-level behavior)

## Impact

- `azula-app/mock-support` (`FakeTransport`) — needs a way to emit an
  arbitrary inbound `IncomingConnection`.
- `InviteReviewSheet` (shared UI) — new Compose UI test target.
- Existing service-layer coverage (`StrangerGateTest`, `InviteServiceTest`) is
  out of scope — this change only adds the UI layer.
