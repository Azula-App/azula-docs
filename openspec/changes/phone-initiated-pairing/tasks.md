## 1. App: open the invite gate to every ALPN

- [ ] 1.1 In `ConnectService.handleStrangerConnection`, drop the
  `inc.alpn == Alpns.CHAT` branch and route every stranger through
  `handleCertOrStrangerConnection` (design D3)
- [ ] 1.2 In `handleCertOrStrangerConnection`, close a stranger that has
  neither a valid invite nor an admitting cert when the ALPN is LLM or TERM,
  so the invite-less closure survives the move
- [ ] 1.3 Confirm `wireStream` produces the right `ConversationKind` for an
  invite-admitted LLM/TERM peer (`kindForAlpn`), and that the conversation is
  keyed the same way a cert-admitted session is
- [ ] 1.4 Rewrite `StrangerGateTest`: keep the invite-less LLM and TERM
  closures, invert the invite-bearing cases to assert a pending request is
  created, and add a cert-fails-then-invite-succeeds case per the
  "Failed certificate check reaches the invite path on every ALPN" scenario

## 2. App: pending requests survive a reconnect

- [ ] 2.1 Change `InviteService.enqueuePending`'s duplicate-endpoint guard from
  "close the new stream" to "replace the held stream on the existing request",
  preserving invite id, peer code, and queue position (design D2)
- [ ] 2.2 Close the superseded stream when replacing, so a dropped redeemer
  leaves nothing dangling
- [ ] 2.3 Verify `accept` wires the current stream after one or more
  replacements, per the "Accepting after a reconnect wires the live stream"
  scenario
- [ ] 2.4 Extend `InviteServiceTest` to cover replacement, including that the
  reported pending count does not grow across reconnects

## 3. CLI: `azula pair` becomes a handshake

- [ ] 3.1 Rework `cli::legacy::cmd_pair` to bind a session, dial the invite's
  endpoint, and present the invite in `Hello` instead of only writing the
  registry
- [ ] 3.2 Wait for the outcome with a bounded deadline, printing a
  "waiting for approval" progress line (design D4)
- [ ] 3.2a Add `--wait <seconds>` overriding the 120s default, and reject a
  zero/negative value rather than treating it as "no wait"
- [ ] 3.3 Re-present the invite on reconnect while the wait is live, per
  `invitations`' "Invite Presentation on Connect"
- [ ] 3.4 Register the device only on acceptance; leave no registry entry on
  decline, timeout, or dial failure
- [ ] 3.5 Map outcomes to distinct exit codes per `cli-surface`'s convention,
  and distinguish decline from timeout from unreachable in the message
- [ ] 3.6 Support `--json` output for the outcome, matching the JSON contract
  the other verbs follow
- [ ] 3.7 Update `azula pair --help` and the `--name` semantics, keeping the
  subcommand-option meaning `cli-surface` already pins

## 4. Wire-up and shared paths

- [ ] 4.1 Confirm the MCP `connect` tool inherits the handshake (it shares
  `SessionCore`), and update its tool description if the wait changes what a
  caller should expect
- [ ] 4.2 Check `core::device::connect_device`'s connected-state handling
  against `cli-send-delivery-truthfulness`; sequence after it, or reconcile
  the overlap in `core/device.rs` deliberately
- [ ] 4.3 Add a CLI-side test that a declined pairing leaves `azula devices`
  empty

## 5. End-to-end verification

- [ ] 5.1 Real-device run: mint an invite from the app's "＋ connect a peer",
  `azula pair` it, approve on the phone, confirm the device registers
- [ ] 5.2 Confirm a follow-up one-shot `azula message send` connects with no
  bridge process running and no invite re-presented (session-cert path)
- [ ] 5.3 Exercise decline and timeout against a real phone, confirming exit
  codes and that no registry entry is left behind
- [ ] 5.4 Confirm a phone already paired needs no re-pairing after the CLI
  restarts under a new session identity, per the amended
  "Restart preserves pairing" scenario

## 6. Docs

- [ ] 6.1 Update `azula-cli/README.md` where it describes pairing as
  one-directional
- [ ] 6.2 Run the `doc-examples` skill if any published `azula pair`
  invocation changed shape
