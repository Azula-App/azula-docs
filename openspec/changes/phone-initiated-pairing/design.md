## Context

The two pairing directions are not symmetric, and only one of them works.

A phone redeeming a CLI-minted invite dials the CLI, which runs
`accept_gate::gate_stranger`: verify the invite, register the device,
admit — no prompt, because the CLI has no user to prompt. That path works.

The reverse fails at the ALPN branch. `ConnectService.handleStrangerConnection`
tries `admitSessionCert` first, then:

```kotlin
if (inc.alpn == Alpns.CHAT) handleCertOrStrangerConnection(inc, hello)
else runCatching { inc.stream.close() }
```

`handleCertOrStrangerConnection` is the only caller of
`inviteService.verifyInbound`, so on `azula/llm/0` and `azula/term/0` the
invite is never read. `core::device::dial_device` connects with `LLM_ALPN`
unconditionally, and nothing in the CLI dials CHAT — its only `CHAT_ALPN` is
the relay role's accept side. So the CLI can only knock on the door the app
does not answer.

`admitSessionCert` cannot bridge the gap on its own: it requires
`root_pk` to already be a known machine contact, and the only way to become
one is the invite gate. That is the chicken-and-egg at the centre of this
change.

Two constraints shape the design. First, an ALPN is not cosmetic here —
`azula/term/0` carries an interactive shell, so "who may open one" is a
security boundary, not a routing detail. Second, a one-shot CLI invocation is
not a process that can wait around: `azula message send` writes its frames and
exits, so any design that depends on the redeemer still being connected when a
human taps a button must put that wait somewhere that actually waits.

## Goals / Non-Goals

**Goals:**

- `azula pair <phone invite>` completes a real pairing, end to end, with the
  user's approval recorded on the phone.
- Bring the app back into conformance with `invitations`' existing "falls
  through to the ordinary invite verification path" rule, which today holds
  only on CHAT.
- Preserve the app's explicit-consent model: a stranger still becomes a
  pending request the user accepts or declines.
- Leave the wire format alone — invite payload, `Hello`, and ALPN strings
  unchanged.

**Non-Goals:**

- Making `azula message send` pair implicitly. Pairing is an explicit act;
  sending is not the place to acquire trust.
- Fixing `send`'s false `ok` — `cli-send-delivery-truthfulness` owns that.
- Letting an invite-less stranger onto LLM/TERM. That closure stays.
- Any change to how the phone redeems a CLI-minted invite. That direction
  works and is not touched.

## Decisions

### D1: The redeemer waits for approval; the app keeps prompting

`azula pair` dials, presents the invite, and blocks on the outcome —
approved, declined, or timed out — registering the device only on approval.
The app's pending-request model is extended to LLM/TERM unchanged.

The tempting alternative is to auto-admit a verified invite on the agent
ALPNs with no prompt, mirroring what the CLI does on its own accept side.
It is a smaller diff and it was the first shape considered. It was rejected
on two grounds. The consent asymmetry between CLI and app is deliberate and
already spec'd — `invitations` says a stranger on the app "SHALL become a
persisted pending request … until the user explicitly accepts or declines",
while "On the CLI, verification success SHALL constitute acceptance". The CLI
skips the prompt because it has nobody to ask, not because invites are
self-authorising. And the ALPNs this change opens are precisely the ones worth
prompting for: admitting a stranger to `azula/term/0` without a tap grants a
shell. Sharing a link is a weaker signal than approving a named device, and it
is the only signal auto-admit would have.

Waiting also has spec support already: "Invite Presentation on Connect"
requires a redeemer to "keep re-presenting it on auto-reconnect attempts until
the issuer has accepted it" — a redeemer that survives to reconnect is assumed
by the existing wire contract.

### D2: The pending-request duplicate guard becomes a replacement, not a refusal

`InviteService.enqueuePending` currently closes any second connection from an
endpoint that already has a pending request. Under D1 a waiting redeemer
reconnects, so that guard would refuse exactly the peer it is waiting on — the
mechanism that made our first three sends land nowhere.

The guard becomes: a new connection from an endpoint with an existing pending
request replaces the held stream on that request, keeping its identity,
invite id, peer code, and queue position. The user sees one request that stays
current, not a stale one holding a dead stream.

### D3: The ALPN branch narrows to invite-less strangers

`handleStrangerConnection` stops branching on ALPN and routes every stranger
through `handleCertOrStrangerConnection`. The LLM/TERM closure moves down to
where the invite is actually evaluated: no valid invite and no admitting cert
on those ALPNs still closes.

This keeps one gate rather than two, which is what the spec always described,
and it makes `StrangerGateTest`'s surviving assertions sharper — they become
"invite-less LLM/TERM stranger is closed", which is the real rule, rather than
"LLM/TERM stranger is closed", which over-states it.

### D4: Bounded wait, 120s by default, overridable with `--wait`

`azula pair` waits 120s by default with a printed "waiting for approval on
your phone…", then exits non-zero on timeout with the pending request left
intact on the phone — a later `azula pair` with the same invite resumes rather
than duplicating, since the invite is not consumed until accepted. Distinct
exit codes let a script tell decline from timeout, per `cli-surface`'s
existing 0/1/2 convention.

120s covers unlocking a phone and finding the notification without hanging a
scripted pairing. `--wait <seconds>` overrides it, so CI can fail faster and a
slow path can allow longer without the default having to suit both. An
unbounded wait was rejected: `azula pair` is scriptable, and a hung pairing in
CI is worse than a failed one.

### D5: One pending-request card for every ALPN

The app's pending-request UI does not distinguish a chat peer from an agent or
terminal peer. A request looks the same whichever ALPN it arrived on.

The alternative — naming the capability on the card, so approving a shell
reads differently from approving a conversation — was considered and not
taken. It keeps the invites screen and the pending-request model unchanged,
and avoids threading the ALPN through to the UI layer.

The cost is that D1's consent step carries less information than it could:
the user is approving a named, invited device, not a specific capability, so
the tap answers "do I know this machine" rather than "do I mean to give it a
shell". The invite remains the narrower control — user-minted, single-target,
and expiring — and the invite-less closure on LLM/TERM (D3) still stands.
Worth revisiting if terminal pairing over an invite becomes common; see the
risk below.

## Risks / Trade-offs

- **Opening LLM/TERM to the invite gate widens what an invite can reach: a
  shell, not just a chat.** → The invite is still user-minted, single-target,
  expiring, and now always user-approved before admission (D1). The
  invite-less closure is retained (D3), so the exposure is exactly "someone
  the user handed a link to and then approved", which is the same bar CHAT
  already meets.
- **`azula pair` becoming a blocking network command is a breaking change for
  scripts.** → Called out as **BREAKING** in the proposal; the timeout is
  bounded and the exit codes are distinct. Worth noting the command's current
  contract is "succeeds and stores something that cannot connect", so there is
  little correct behaviour to preserve.
- **D2 lets a stranger refresh a pending request indefinitely by
  reconnecting.** → Accepted without a rate limit. Replacement is confined to
  the same endpoint id, so it cannot displace a *different* peer's request,
  and the request count the notification reports is unchanged. A cap or a
  minimum interval was considered and rejected: both risk failing an honest
  retry on a flaky network, which is when reconnects matter most.
- **A user approving a terminal peer sees the same card as a chat peer
  (D5).** → The residual exposure is a device the user both invited and
  approved, which is the bar CHAT already meets; the invite is the narrower
  control. The mitigation not taken is naming the capability on the card. If
  invite-driven terminal pairing becomes a common path — rather than the
  scan-a-QR-from-a-running-host flow it is today — this should be revisited
  before that traffic grows.
- **Two changes touching pairing land near each other.**
  `cli-send-delivery-truthfulness` reworks `connect_device`'s connected-state
  handling, which this change also depends on for its wait loop. → Sequence it
  first, or expect a merge conflict in `core/device.rs`.

## Migration Plan

No persisted data changes shape, so there is nothing to migrate and rollback
is a revert.

Ordering matters across repos: the app must ship the gate change before the
CLI's waiting `azula pair` is useful, since a waiting redeemer against an
old app just waits out its timeout and exits non-zero. That degrades to
today's behaviour (no pairing) rather than to a wrong one, so the two can ship
independently — but the CLI change should not be released as "pairing now
works" until an app carrying the gate change is out.

Registry entries written by the old `azula pair` point at devices that were
never really paired. They are indistinguishable from real ones by inspection;
re-pairing overwrites them, now that rows are keyed by endpoint id
(`cli-naming-and-registry-keying`).

## Open Questions

None outstanding. The three questions this design opened — whether the
pending-request card should name the capability, whether reconnects need rate
limiting, and how long `azula pair` should wait — are settled in D5, D2, and
D4 respectively. D5 carries a residual risk that is deliberately accepted
rather than resolved; it is recorded above with the condition that should
prompt a revisit.
