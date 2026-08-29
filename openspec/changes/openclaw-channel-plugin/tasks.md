## 1. Bridge tools in `azula-cli`

Sequenced first: the plugin cannot start without these (design D7).

- [ ] 1.1 Add a structured inbox event type in `core` covering `message`,
      `ui_event`, `file`, `connected`, `disconnected` with its source device,
      reusing `azula watch --json`'s existing event vocabulary rather than a
      parallel one — verify `cargo build` passes and the watch and event shapes
      serialize identically for the same inbox entry
- [ ] 1.2 Add a `SessionCore` accessor that drains the inbox structurally,
      supporting both immediate and timeout-bounded modes over the same queue
      backing `get_messages`/`wait_for_reply` — verify a unit test shows an
      event drained structurally is not returned again by `get_messages`
- [ ] 1.3 Expose `get_events` in `bridge/tools.rs` as a thin wrapper over 1.2,
      with an optional `timeout_s` — verify a test asserts the waiting mode
      returns as soon as an event arrives and returns empty (not an error) on
      timeout
- [ ] 1.4 Expose `set_typing(device, on)` emitting a bare `thinking` frame,
      erroring immediately when the device is unreachable rather than queuing —
      verify a test covers on, off, and the unreachable-device error, and that
      nothing is written to the relay or local mailbox
- [ ] 1.5 Update `specs/mcp-bridge/design.md`'s tool catalog table and the
      module doc comment at the top of `bridge/tools.rs` to list both new tools
      — verify the table row count matches the registered tool count
- [ ] 1.6 Verify a real bridge end to end: run `azula mcp`, call `get_events`
      with a timeout, tap an A2UI surface on a paired device, and confirm the
      tap payload arrives verbatim rather than as a rendered `ui-event:` line

## 2. `azula-openclaw` repo scaffold

- [ ] 2.1 Create the `azula-openclaw/` sibling repo with TypeScript, Node
      22.22.3+ engines, and the OpenClaw package layout (`package.json` with
      `openclaw.channel` metadata, `openclaw.plugin.json`, `index.ts`,
      `setup-entry.ts`, `src/`) — verify `npm install && npm run typecheck`
      passes
- [ ] 2.2 Declare the channel config schema in `openclaw.plugin.json`
      (`channels.azula`: target device, optional binary path, session name,
      display label) — verify an invalid config is rejected at validation time,
      before the runtime loads
- [ ] 2.3 Register the channel via `defineChannelPluginEntry` with id `azula`
      and account resolution over multiple accounts — verify
      `openclaw channels add` offers `azula` and two configured accounts
      resolve to distinct devices
- [ ] 2.4 Add the parent-checkout wiring for a sixth repo: project-map entry in
      `azula-docs/openspec/project.md` and any `.gitignore`/symlink updates —
      verify a fresh clone of the parent checkout still resolves the openspec
      tree

## 3. The azula bridge client

- [ ] 3.1 Implement an MCP stdio client that spawns
      `azula mcp --session <name> --name <label>` and owns its lifetime —
      verify a test asserts the child is spawned once per account and reaped on
      channel shutdown
- [ ] 3.2 Probe the advertised tool list at startup and fail with a
      configuration error naming the required azula version when `get_events`
      or `set_typing` is missing — verify a test against a stub server lacking
      the tools produces that error and not a per-message failure
- [ ] 3.3 Detect the missing-binary and unpaired-device cases as distinct
      configuration errors that do not block other channels from starting —
      verify a test covers both messages and asserts the gateway still starts
- [ ] 3.4 Implement reconnect with bounded backoff, resuming both directions,
      and surface persistent failure as an unhealthy channel — verify a test
      kills the child mid-run and asserts traffic resumes without a spin loop

## 4. Outbound

- [ ] 4.1 Map `outbound.sendText` to `send_message`, returning a correlatable
      id and treating azula's queued-delivery outcome as success — verify tests
      cover reachable, queued, and rejected outcomes
- [ ] 4.2 Map attachments to `send_file`, advertising the 64 MiB cap via the
      channel's media limits so oversized media is refused before transfer —
      verify a test asserts an oversized attachment errors with the limit named
      and sends no frames
- [ ] 4.3 Render structured choices as A2UI surfaces via `render_ui` with a
      surface id derived from the asking message's id, always accompanied by
      the text fallback in the same turn — verify a test asserts both are sent
      and that the components array carries exactly one `"id":"root"`
- [ ] 4.4 Delete surfaces once answered or once the turn ends, re-rendering
      rather than patching after a session restart — verify a test asserts no
      surface outlives its turn and that a restart re-renders
- [ ] 4.5 Implement `heartbeat.sendTyping`/`clearTyping` over `set_typing`,
      clearing on turn end including abnormal termination, and treating a
      typing failure as non-fatal — verify a test asserts the indicator is
      cleared after an erroring turn

## 5. Inbound

- [ ] 5.1 Implement the pump: long-poll `get_events` and translate each event
      type into an OpenClaw inbound envelope with sender, route, and content —
      verify tests cover each of the five event types
- [ ] 5.2 Map `file` events to ordered inbound media facts via
      `toInboundMediaFacts` — verify a test asserts multiple attachments keep
      their received order
- [ ] 5.3 Correlate `ui_event` back to the asking message by surface id and
      deliver it as that message's answer — verify a test asserts the agent
      turn continues with the tapped choice
- [ ] 5.4 Keep `connected`/`disconnected` as liveness state only, never
      dispatched as user messages — verify a test asserts no agent wake on
      either event
- [ ] 5.5 Wire durable ingestion via `createChannelIngressMonitor`, appending
      durably before treating a batch as consumed, with `createIngressEffectOnce`
      for non-idempotent effects — verify a test asserts a crash between drain
      and dispatch neither loses nor duplicates events
- [ ] 5.6 Verify text that literally resembles a rendered event line is
      dispatched as ordinary message text

## 6. Access control and pairing

- [ ] 6.1 Resolve the DM allowlist from azula's paired-device registry rather
      than a second identifier space — verify a test asserts traffic from an
      unpaired device is not dispatched
- [ ] 6.2 Surface `start_pairing`'s invite URL and QR through the channel's
      pairing text hooks — verify pairing an unpaired phone end to end through
      `openclaw` and confirming the conversation appears

## 7. Integration and docs

- [ ] 7.1 End-to-end against a real gateway and a real phone: send a text
      message, an attachment, and an approval with buttons; reply, tap, and
      send a file back — verify all six land correctly in both directions
- [ ] 7.2 Restart the gateway and confirm the phone shows the same conversation
      continuing rather than a second one
- [ ] 7.3 Write `azula-openclaw/README.md` covering install
      (`openclaw plugins install @azula-app/openclaw`), configuration, pairing,
      and the minimum azula version — verify every command in it runs as
      written
- [ ] 7.4 Publish `@azula-app/openclaw` to npm — needs Sal's go-ahead, as it
      ships
