# Never drop a reply; render rich replies as azula UI

## Why

On 2026-10-12 Sal asked the OpenClaw bot over azula "Tell me about Rockridge,
Oakland using all the components you can." and received nothing. houston's
gateway log has the cause:

    [azula] delivering a block reply failed: Error: azula can only attach local
    files; 'https://www.bart.gov/…/Rockridge%20Station.png?itok=…' is not a local path

The plugin's reply funnel forwarded only `text` and `mediaUrl(s)`, and sent the
text as the *first attachment's caption*. A remote image URL failed, and the
whole answer went with it. A second silent path sat beside it: a reply whose
content was in `presentation`, `interactive`, `fallbackText` or `location`
with empty `text` was dropped without even a log line — and core does not
degrade presentation on the inbound-dispatch path; the SDK docs say a
channel-local funnel must materialize that fallback itself. Finally, the
spec's "Interactive Surfaces for Structured Choices" was never wired: the
plugin could translate a tap back, but never rendered a surface, and
OpenClaw's system prompt told the agent "Inline buttons OFF for azula".

## What Changes

- One delivery funnel (`deliverReply`) for every payload kind — block, final,
  `message send`, cron. It folds legacy `interactive` into `presentation`,
  runs core's `renderPresentationForDelivery` (tables and charts become text),
  uses `fallbackText` when there is no text, and adds a `Location:` line.
- Text goes out **first, immediately**, as its own message. Attachments follow:
  local files via send_file; remote http(s) URLs fetched through the gateway's
  guarded loader (`saveRemoteMedia`: private addresses refused, 64 MiB cap,
  bounded time) then sent; a fetch that fails is sent as a link message. A
  failed attachment never takes the text with it.
- After the text, a presentation's tappable controls (callback, command and
  question buttons; selects as a column of buttons) render as an A2UI card;
  links, approvals and model pickers stay in the text, which lists every
  control. A hidden value the gateway would treat as a command (`/…`, a `!`
  shortcut, an abort word like `stop`) is never minted as a button, so a tap
  cannot run a command the user never saw. A
  `render_ui` failure leaves the text as the fallback.
- Nothing deliverable is never silent: a payload with content azula cannot
  show logs a warning naming its keys.
- The channel declares what it can render (`presentationCapabilities`,
  `describeMessageTool` → `presentation`, `inlineButtons`, prompt hints), so the
  agent knows to use it.

## Capabilities

### Modified Capabilities

- `openclaw-channel`: Outbound Text Delivery, Outbound Attachments and
  Interactive Surfaces for Structured Choices are restated as built; adds
  "A Reply Is Never Dropped Silently".

## Impact

- **azula-openclaw** 0.0.6: new `src/{reply,rich,media}.ts`; `agent`,
  `outbound`, `channel`, `runtime`, `lifecycle`, `gateway` edited; README "What
  the bot can send". No manifest change: `actions`/`agentPrompt` add a
  parameter to core's existing message tool rather than a declared surface.
- Declaring `inlineButtons` also changes OpenClaw's exec-approval guidance for
  this channel to "native buttons first"; azula renders approvals as text with
  their `/approve` command, which the user can tap only where it is a command
  button, or type.
