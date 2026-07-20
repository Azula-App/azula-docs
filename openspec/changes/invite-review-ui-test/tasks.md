## 1. FakeTransport seam

- [ ] 1.1 Add a way for `FakeTransport` to emit an arbitrary inbound
      `IncomingConnection` (not just the fixed one-shot "mockterm"
      connection).
- [ ] 1.2 Unit-test the new seam in isolation.

## 2. InviteReviewSheet Compose UI test

- [ ] 2.1 Test: a valid stranger invite renders the review sheet with
      accept/decline actions.
- [ ] 2.2 Test: accept adds the peer to contacts and wires the stream.
- [ ] 2.3 Test: decline closes and forgets the connection.
