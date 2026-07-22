## 1. FakeTransport seam

- [x] 1.1 Add a way for `FakeTransport` to emit an arbitrary inbound
      `IncomingConnection` (not just the fixed one-shot "mockterm"
      connection). Added `injectIncomingConnection`, merged into `incoming()`
      alongside the fixed demo connections.
- [x] 1.2 Unit-test the new seam in isolation (`FakeTransportTest`).

## 2. InviteReviewSheet Compose UI test

- [x] 2.1 Test: a valid stranger invite renders the review sheet with
      accept/decline actions.
- [x] 2.2 Test: accept adds the peer to contacts and wires the stream
      (`InviteReviewSheetE2eTest.acceptingAVerifiedStrangerWiresAConversationAndClearsThePending`).
- [x] 2.3 Test: decline closes and forgets the connection
      (`InviteReviewSheetE2eTest.decliningAnUnverifiedStrangerClearsThePendingWithoutCreatingAConversation`).
