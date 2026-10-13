## 1. Notice a dropped connection

- [x] 1.1 Clear `connected` and the send handle when the dial-side reader or the
      accept-side read loop ends, guarded by a per-connection generation so a
      superseded connection winding down cannot disconnect its replacement
- [x] 1.2 Emit `disconnected` on that transition and `connected` on every
      down→up transition (dial or accept); keep one inbox across reconnects
- [x] 1.3 Text drains discard presence entries and `wait_for_reply` does not
      wake on one; `get_events` reports them; `azula watch` does not print a
      transition twice

## 2. Dial what the registry holds

- [x] 2.1 Accept a bare endpoint id as a dial target (by id, via address
      lookup) as well as a full ticket; match bare-id rows on reconnect
- [x] 2.2 Stop the accept side downgrading a dialable ticket to a bare id

## 3. Maintain presence

- [x] 3.1 One in-flight dial per device; callers that arrive mid-dial share its
      result; an explicit `disconnect` holds the device down until the next send
- [x] 3.2 Replace the mail-only 25 s loop with a presence loop: redial a device
      seen down with backoff 5 s → 60 s (25 s cap while mail is queued), each
      dial bounded at 30 s; the loop dies with the session
- [x] 3.3 Reconnect does what the startup dial does: Hello with cert,
      thinking(false), mailbox flush, profile

## 4. Verify

- [x] 4.1 Tests: down-at-startup device reconnected once reachable and given
      Hello; dropped connection redialed without a send; 8 concurrent ensures →
      1 dial; explicit disconnect respected; refusing peer backed off; loop
      stops with the session; bare-id phone dialable end to end
- [x] 4.2 `cargo clippy --workspace --all-targets -D warnings` clean; full test
      suite passes; real `~/.azula` unchanged across a full run
- [ ] 4.3 On houston: after a bridge restart the phone's OpenClaw conversation
      comes back online without anyone sending
