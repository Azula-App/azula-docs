## ADDED Requirements

### Requirement: InviteReviewSheet SHALL have Compose UI test coverage

The inbound accept/decline invite-review path SHALL be covered by the shared-UI-behavior JVM Compose suite described in `openspec/specs/testing/design.md`, in addition to the existing service-layer coverage (`StrangerGateTest`, `InviteServiceTest`), driven through a `FakeTransport` capable of emitting an arbitrary inbound connection (not just its fixed one-shot "mockterm" connection).

#### Scenario: Accept and decline are exercised through InviteReviewSheet

- **WHEN** the JVM Compose UI test suite drives an arbitrary inbound stranger
  connection through `FakeTransport` into `InviteReviewSheet`
- **THEN** both the accept path (peer added to contacts, stream wired) and
  the decline path (connection closed and forgotten) are exercised at the UI
  layer
