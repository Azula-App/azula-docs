## Context

Two facts in `azula-cli` combine into a false success report:

- `core::send_message` (`src/core/mod.rs:663-666`) writes four frames to the
  QUIC send stream and returns `SendOutcome::Sent`. Nothing is read back;
  there is no ack in the protocol.
- `connect_device` (`src/core/device.rs:131-164`) sets `conn.connected = true`
  after a successful dial and a `Hello` write, without waiting for a reply,
  and no code path ever sets it back to `false`. `reader_loop`
  (`src/core/device.rs:151`, `173`) just returns when the stream ends.

On the app side, `InviteService.enqueuePending` closes an incoming stream
when a pending request from that endpoint id already exists:

```kotlin
if (pending.any { it.endpointId == endpointId }) {
    scope.launch { runCatching { stream.close() } } // already have one from this peer
    return
}
```

So a session awaiting approval on the phone gets its stream closed, the CLI
never notices, and `azula message send` prints `ok`.

The constraint that shapes every option below: **there is no ack, and no
`pending`/`denied` frame in `src/proto.rs`.** The app signals refusal by
closing the stream and nothing else. Truthfulness has to be inferred from
transport behaviour, or the protocol has to grow a signal.

## Goals / Non-Goals

**Goals:**

- `azula message send` and the MCP `send_message` tool never report delivery
  they have not established.
- A refused message still gets delivered when possible — it enters the
  relay → mailbox chain rather than being dropped.
- A caller can distinguish refused from queued-offline without parsing prose.
- A peer that hung up stops reading as connected across `status` and `watch`.

**Non-Goals:**

- Pairing defaults and registry keying — `cli-naming-and-registry-keying`.
- Changing the delivery chain itself (relay, then mailbox) or the mailbox
  format. Only what counts as delivered changes.
- Retry-on-approval. The mailbox already covers deferred delivery; a retry
  loop would risk duplicates.

## Decisions

### 1. Mark a device disconnected when its reader loop ends

Independent of the mechanism chosen in Decision 2, and worth doing on its
own: when `reader_loop` ends (EOF, reset, or error), clear `connected` and
the send handle. Today's forever-connected state misreports `status` and
`watch` as well as `send`, and it is the reason a refused peer looks live on
the next call.

### 2. How delivery is established — **decide before implementing**

Three options, in increasing cost and precision. **Recommended: (a).**

**(a) Stream liveness.** After writing the frames, confirm the peer has not
stopped the stream, and treat the reader-loop disconnect from Decision 1 as
the backstop. Stays inside azula-cli, needs no app release, and fixes the
stale-`connected` misreport for free.
*Cost:* QUIC buffers writes, so a stream closed microseconds earlier can
still accept bytes locally. This narrows a systematic misreport to a race
rather than eliminating it — the first send after a close may still report
optimistically, with the next call correct. Whether that race is observable
in practice is the open question below, and it must be answered by test
before the refused status is promised in the JSON contract.

**(b) Await the peer's `Hello` reply.** `mcp-bridge` already requires that
"every accepted app connection (not peer-bridge connection) SHALL receive a
`Hello{name: own_name}` frame in reply" — and a connection closed at
`enqueuePending` never sends one. That makes the reply a positive admission
signal rather than an inference.
*Cost:* the same requirement exempts peer-bridge connections, and legacy
clients admitted under the still-open `--allow-legacy` hatch may not send it.
Making admission conditional on a frame that is legitimately absent would
break working setups, and a timeout fallback reinstates the optimistic answer
this change exists to remove. Becomes viable once
`invitations-legacy-sunset` closes the hatch — which is the argument for
sequencing this change after it.

**(c) Add a `pending`/`denied` frame.** The app tells the CLI why it closed.
The only option that yields a precise "waiting for approval on your phone"
message instead of a generic not-delivered.
*Cost:* crosses into azula-app, needs a wire addition, a lockstep release,
and a story for clients that do not send it — which is the same legacy
problem as (b), plus a release dependency.

### 3. Refused is reported distinctly from queued

Whichever mechanism lands, a refused send is not the same event as an
offline one. `SendOutcome` gains a variant, the human line replaces the bare
`ok`, and `--json` reports a third status. A script polling delivery needs to
tell "the phone is off" from "the phone is refusing this connection until you
approve it" — they call for different user action.

## Risks / Trade-offs

- **Option (a) leaves a race.** → Accepted deliberately: it converts an
  always-wrong report into an occasionally-late one, and Decision 1 makes the
  following call correct. Quantified by test before the contract promises the
  status.
- **Marking disconnected on reader-loop end may flap.** A transient stream
  end could mark a device down that is about to reconnect. → `ensure_device`
  already re-dials on demand (`src/core/mod.rs:584-611`), so a flap costs a
  redial, not a lost message.
- **A newly honest CLI reports failures that were previously silent.** Scripts
  keying on `ok` will start seeing a non-success status where they saw none.
  → That is the point, but it is a behaviour change worth a release note.
- **Sequencing against `invitations-legacy-sunset`.** If that lands first,
  option (b) becomes materially better and this design should be revisited
  rather than implemented as-is.

## Migration Plan

1. Decision 1 can ship on its own — it is a strict improvement with no
   contract change.
2. Resolve Decision 2 before implementing the send path.
3. If option (a): CLI-only, ship independently.
   If (b) or (c): sequence after `invitations-legacy-sunset`, and for (c)
   coordinate the app release.
4. Release-note the reporting change: a command that used to print `ok` can
   now report not-delivered.

## Open Questions

- **What is actually observable when the app closes at `enqueuePending`?**
  Whether the first `send_message` after that close can detect it, or only
  the one after the reader loop notices, decides whether the refused status
  is reliable on the first attempt. Needs an integration test against a peer
  that closes on connect. This is the first task, and it gates the contract.
- Should this change wait for `invitations-legacy-sunset` so option (b) is
  on the table?
- Does the relay path (`try_deliver_via_relay`, `src/core/mod.rs:678`) have
  the same optimistic-report problem? It reports `Queued` on a successful
  write to the relay, which is a weaker claim than `Sent` — but worth
  checking that a relay that accepts and drops is not also reported as
  success.
