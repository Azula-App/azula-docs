## 1. Never drop a reply

- [x] 1.1 One funnel (`deliverReply`) for block, final, `message send` and cron
      payloads: interactive → presentation, core's presentation renderer,
      `fallbackText`, location line
- [x] 1.2 Text first and immediately, as its own message; then attachments —
      local via send_file, remote fetched through `saveRemoteMedia` (64 MiB) or
      sent as a link; a failed attachment never takes the text
- [x] 1.3 Content azula cannot show logs a warning naming the payload keys;
      a truly empty payload logs at debug

## 2. Rich replies as azula UI

- [x] 2.1 Tappable controls (callback, command, question; selects) render as an
      A2UI card after the text; links/approvals/model pickers stay text; the
      text lists every control; `render_ui` failure leaves the text
- [x] 2.2 A hidden value the gateway would treat as a command (`/`, `!`, abort
      words) is not minted as a button; command-type controls stay mintable
- [x] 2.3 Declare `presentationCapabilities`, `describeMessageTool` →
      `presentation`, `inlineButtons` and prompt hints

## 3. Verify

- [x] 3.1 Reproduce houston's failure (block reply, text + remote PNG with query
      string) in a test; it fails on 0.0.5 and passes now, text before fetch
- [x] 3.2 Tests for presentation-only, fallback mode, interactive → surface, tap
      round trip, location, render_ui failure, outbound degrade
- [ ] 3.3 On houston: the Rockridge prompt gets its answer on the phone
