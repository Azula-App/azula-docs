## 1. Bridge tools in `azula-cli`

Sequenced first: the plugin cannot start without these (design D7).

- [x] 1.1 Add a structured inbox event type in `core` covering `message`,
      `ui_event`, `file`, `connected`, `disconnected` with its source device,
      reusing `azula watch --json`'s existing event vocabulary rather than a
      parallel one — verify `cargo build` passes and the watch and event shapes
      serialize identically for the same inbox entry
- [x] 1.2 Add a `SessionCore` accessor that drains the inbox structurally,
      supporting both immediate and timeout-bounded modes over the same queue
      backing `get_messages`/`wait_for_reply` — verify a unit test shows an
      event drained structurally is not returned again by `get_messages`
- [x] 1.3 Expose `get_events` in `bridge/tools.rs` as a thin wrapper over 1.2,
      with an optional `timeout_s` — verify a test asserts the waiting mode
      returns as soon as an event arrives and returns empty (not an error) on
      timeout
- [x] 1.4 Expose `set_typing(device, on)` emitting a bare `thinking` frame,
      erroring immediately when the device is unreachable rather than queuing —
      verify a test covers on, off, and the unreachable-device error, and that
      nothing is written to the relay or local mailbox
- [x] 1.5 Update `specs/mcp-bridge/design.md`'s tool catalog table and the
      module doc comment at the top of `bridge/tools.rs` to list both new tools
      — verify the table row count matches the registered tool count
- [x] 1.6 Verify a real bridge end to end. DONE so far, over a live `azula mcp`
      via JSON-RPC: `get_events` with `timeout_s` returns `[]` rather than an
      error, and both new tools reject an unknown device. STILL PENDING: the
      on-device half — tap an A2UI surface on a paired phone and confirm the
      payload arrives verbatim rather than as a rendered `ui-event:` line.
      VERIFIED ON HARDWARE. A tap on a real phone arrives as a structured
      `ui_event` carrying its payload verbatim
      (`{"version":"v0.9.1","action":{...,"context":{"choice":"approve"}}}`),
      not as a rendered `ui-event:` line

## 2. `azula-openclaw` repo scaffold

- [x] 2.1 Create the `azula-openclaw/` sibling repo with TypeScript and the
      OpenClaw package layout (`package.json` with `openclaw.channel` metadata,
      `openclaw.plugin.json`, `index.ts`, `setup-entry.ts`, `src/`) — verify
      `npm install && npm run typecheck` passes
- [x] 2.1a Pin the toolchain in `azula-openclaw/mise.toml`
      (`node = "22.23.2"`, satisfying OpenClaw's 22.22.3+ floor) rather than in
      a `package.json` `engines` field, per the `toolchain` capability from
      `mise-toolchain-pinning` — verify CI reads the version from that file and
      no workflow restates it
- [x] 2.2 Declare the channel config schema in `openclaw.plugin.json`
      (`channels.azula`: target device, optional binary path, session name,
      display label) — verify an invalid config is rejected at validation time,
      before the runtime loads
- [x] 2.3 Register the channel via `defineChannelPluginEntry` with id `azula`
      and account resolution over multiple accounts — verified against a real
      gateway (2026.7.1-2) in an isolated `--profile`: the plugin installs and
      loads, `plugins doctor` reports no issues, `azula` appears in
      `channels list --all`, and a configured account reads back as
      "installed, configured, enabled"
- [x] 2.4 Add the parent-checkout wiring for a sixth repo: project-map entry in
      `azula-docs/openspec/project.md` and any `.gitignore`/symlink updates —
      verify a fresh clone of the parent checkout still resolves the openspec
      tree

## 3. The azula bridge client

- [x] 3.1 Implement an MCP stdio client that spawns
      `azula mcp --session <name> --name <label>` and owns its lifetime —
      verify a test asserts the child is spawned once per account and reaped on
      channel shutdown
- [x] 3.2 Probe the advertised tool list at startup and fail with a
      configuration error naming the required azula version when `get_events`
      or `set_typing` is missing — verify a test against a stub server lacking
      the tools produces that error and not a per-message failure
- [x] 3.3 Detect the missing-binary and unpaired-device cases as distinct
      configuration errors that do not block other channels from starting —
      verify a test covers both messages and asserts the gateway still starts
- [x] 3.4 Implement reconnect with bounded backoff, resuming both directions,
      and surface persistent failure as an unhealthy channel — verify a test
      kills the child mid-run and asserts traffic resumes without a spin loop

## 4. Outbound

- [x] 4.1 Map `outbound.sendText` to `send_message`, returning a correlatable
      id and treating azula's queued-delivery outcome as success — verify tests
      cover reachable, queued, and rejected outcomes
- [x] 4.2 Map attachments to `send_file`, advertising the 64 MiB cap via the
      channel's media limits so oversized media is refused before transfer —
      verify a test asserts an oversized attachment errors with the limit named
      and sends no frames
- [x] 4.3 Render structured choices as A2UI surfaces via `render_ui` with a
      surface id derived from the asking message's id, always accompanied by
      the text fallback in the same turn — verify a test asserts both are sent
      and that the components array carries exactly one `"id":"root"`
- [x] 4.4 Delete surfaces once answered or once the turn ends, re-rendering
      rather than patching after a session restart — verify a test asserts no
      surface outlives its turn and that a restart re-renders
- [x] 4.5 Implement `heartbeat.sendTyping`/`clearTyping` over `set_typing`,
      clearing on turn end including abnormal termination, and treating a
      typing failure as non-fatal — verify a test asserts the indicator is
      cleared after an erroring turn

## 5. Inbound

- [x] 5.1 Implement the pump: long-poll `get_events` and translate each event
      type into an OpenClaw inbound envelope with sender, route, and content —
      verify tests cover each of the five event types
- [x] 5.2 Map `file` events to ordered inbound media facts via
      `toInboundMediaFacts` — verify a test asserts multiple attachments keep
      their received order
- [x] 5.3 Correlate `ui_event` back to the asking message by surface id and
      deliver it as that message's answer — verify a test asserts the agent
      turn continues with the tapped choice
- [x] 5.4 Keep `connected`/`disconnected` as liveness state only, never
      dispatched as user messages — verify a test asserts no agent wake on
      either event
- [x] 5.5 Wire durable ingestion. NOTE: `createChannelIngressMonitor` and
      `createIngressEffectOnce` do not exist in the shipped SDK (2026.7.1-2) —
      the docs describe them but no bundle exports them. Used
      `createClaimableDedupe`'s claim/commit/release instead, which is the
      same property; see design D6 — verified by tests covering replay,
      release-on-failure, and continuing past a failed item
- [x] 5.6 Verify text that literally resembles a rendered event line is
      dispatched as ordinary message text

## 6. Access control and pairing

- [x] 6.1 Resolve the DM allowlist from azula's paired-device registry rather
      than a second identifier space — verify a test asserts traffic from an
      unpaired device is not dispatched
- [x] 6.2 Surface `start_pairing`'s invite URL and QR through the channel's
      pairing text hooks — VERIFIED ON HARDWARE. The plugin fetched its own
      session invite, it was delivered to the Pixel 10a's `mdtest` build, and
      the phone paired and connected: direct, 11–12ms. The typing indicator
      round-tripped live in 12ms and outbound text reached the connected
      device on the same run

## 7. Integration and docs

- [ ] 7.1 End-to-end against a real gateway and a real phone. MOSTLY DONE.
      Gateway half complete: a real OpenClaw 2026.7.1-2 loads the plugin,
      `plugins doctor` is clean, the channel reads back as
      installed/configured/enabled. Phone half verified 9/9 via
      `scripts/e2e.mjs` on the Pixel 10a's `mdtest` build: pairing, connection
      (13ms), typing (7ms), outbound text, an approval rendered as real
      Approve/Reject buttons, the tap returning `choice=approve` correlated to
      its asking message, and surface cleanup. STILL PENDING: an attachment
      out and a file sent back — the only two legs of the six not exercised
- [ ] 7.2 Restart the gateway and confirm the phone shows the same conversation
      continuing rather than a second one — BLOCKED on the same reachable
      phone as 7.1. The mechanism it tests (a *named* persistent azula
      session, so the endpoint id and therefore the conversation survive a
      restart) is implemented and unit-tested; what is unverified is the
      phone-side result
- [x] 7.3 Write `azula-openclaw/README.md` covering install
      (`openclaw plugins install @azula-app/openclaw`), configuration, pairing,
      and the minimum azula version — verify every command in it runs as
      written
- [ ] 7.4 Publish `@azula-app/openclaw` to npm — needs Sal's go-ahead, as it
      ships. Also needs the `azula-openclaw` GitHub repo to exist: the repo is
      committed locally with no remote, since creating a public repo is Sal's
      call. Blocked by design, not by readiness
