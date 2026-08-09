All work lands in `azula-cli` unless option (c) in `design.md` is chosen, in
which case `azula-app` is involved too. Create a worktree first —
`git -C azula-cli worktree add ../.worktrees/azula-cli--cli-send-delivery-truthfulness -b cli-send-delivery-truthfulness`
— per the Conventions in `openspec/project.md`; never switch branches in the
shared checkout.

**Group 1 gates the rest.** Decision 2 in `design.md` is deliberately
unresolved: the test in 1.1 measures what is actually observable, and that
result picks the mechanism. Do not implement the send path before it.

## 1. Establish what is observable, then pick the mechanism

- [ ] 1.1 Write the failing integration test: a peer that accepts a dial then
      immediately closes the stream (the app's
      `InviteService.enqueuePending` behaviour) currently yields
      `SendOutcome::Sent`. Assert the outcome that *should* be reported.
- [ ] 1.2 From that test, determine whether the close is detectable on the
      first `send_message` after it, or only after `reader_loop` observes the
      end. Record the answer in `design.md` — it decides whether the refused
      status is reliable on the first attempt.
- [ ] 1.3 Resolve Decision 2 (stream liveness / await `Hello` / new protocol
      frame) against that evidence and the state of
      `invitations-legacy-sunset`. Record the choice and rationale in
      `design.md` before writing the send path.

## 2. Connection liveness

- [ ] 2.1 Mark a device disconnected when its `reader_loop`
      (`src/core/device.rs:151`, `173`) ends: clear `connected` and the send
      handle. `connect_device` sets `connected = true` optimistically
      (`src/core/device.rs:159`) and nothing resets it today. This is
      independent of 1.3 and can land first.
- [ ] 2.2 Test that a device whose stream ends stops reading as connected in
      `status` and `watch`, and that `ensure_device`
      (`src/core/mod.rs:584-611`) re-dials it on the next send rather than
      failing.

## 3. Truthful send outcome

- [ ] 3.1 In `core::send_message` (`src/core/mod.rs:663-666`), stop returning
      `Sent` on write completion alone, using the mechanism chosen in 1.3.
- [ ] 3.2 Ensure a send that fails that check falls into the existing
      relay → mailbox chain rather than being dropped, so the message is
      still delivered once the peer admits the session.
- [ ] 3.3 Add a `SendOutcome` variant distinguishing "peer refused the
      connection" from "peer unreachable, queued".
- [ ] 3.4 Surface it in `message::send` (`src/cli/message.rs:53-67`): replace
      the bare `ok` on the human line, and add the third `--json` status.
- [ ] 3.5 Check the MCP tool's result mapping in `src/mcp.rs` reports the new
      outcome — it shares `core::send_message` via cli-surface's "CLI and MCP
      Share One Core", but confirm rather than assume it inherits.
- [ ] 3.6 Check whether `try_deliver_via_relay` (`src/core/mod.rs:678`) has
      the same optimistic-report problem — a relay that accepts and drops
      should not read as success (design open question).

## 4. Verification

- [ ] 4.1 Tests: peer-closed stream reports not-delivered and enters the
      chain; the three `--json` statuses are distinguishable; an ordinary
      offline send still reports queued exactly as before.
- [ ] 4.2 `cargo test --workspace` and
      `cargo clippy --workspace --all-targets` clean, per
      `openspec/specs/testing/`.
- [ ] 4.3 On hardware: pair a phone, leave the request unapproved, and send a
      message from the CLI. Confirm the CLI does not report success and that
      the message arrives once the request is approved. This is the bug as
      originally observed.
- [ ] 4.4 Run the `doc-examples` skill — the `message send` result line is a
      published surface and its output text changes.
- [ ] 4.5 Add a release-notes entry per `openspec/specs/release-notes/`: a
      command that used to print `ok` can now report not-delivered, which is
      user-visible and may affect scripts.
