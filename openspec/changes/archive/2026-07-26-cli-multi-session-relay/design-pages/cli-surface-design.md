# The azula CLI surface — noun-verb commands, JSONL contracts, one core

`azula-cli`'s command-line surface is a noun-verb taxonomy (`azula message
send`, `azula ui render`, `azula terminal new`, …) sitting as a thin `clap`
layer over the same [`SessionCore`](#sessioncore-the-shared-core) the MCP
tool surface (`AzulaBridge`) calls — cli-multi-session-relay design.md D4:
"The MCP tools and CLI verbs call one `SessionCore`... the MCP layer is a
thin `#[tool_router]` over it, the CLI a thin clap layer." This page is the
CLI's own design doc; see [`mcp-bridge/design.md`](../../../specs/mcp-bridge/design.md)
for the MCP tool catalog and [`session-identity-design.md`](session-identity-design.md)
for how every entry point binds its endpoint.

## Where it lives

- `azula-cli/src/cli/mod.rs` — the top-level `clap::Parser` (`Cli`/`Command`),
  dispatch, and the shared per-verb argument fragments (`DeviceArg`,
  `SessionArg`) every one-shot verb flattens in.
- `azula-cli/src/cli/{message,ui,file,watch_cmd,status_cmd,mcp_cmd,relay_cmd,run_cmd,terminal_cmd,legacy}.rs`
  — one module per noun (or, for `run`/`terminal`, per D5 feature).
- `azula-cli/src/core/mod.rs` — `SessionCore`, the shared connection layer
  (dial/registry/delivery/A2UI/inbox); `core::establish` is the one-shot-vs-
  long-running entry point both `azula mcp` and every one-shot verb call.
- `azula-cli/src/core/{device,status,watch,state,relay_a2ui}.rs` — device map
  + dial/accept, `status` computation, `watch`'s event model, runtime state
  files, the relay's A2UI side store (see
  [`relay-design.md`](relay-design.md)).
- `azula-cli/src/catalog.rs` — the single A2UI catalog prose string shared by
  `azula ui catalog`, `azula ui render --help`, and the `render_ui` MCP tool
  description.
- `azula-cli/src/bridge/tools.rs` — the MCP-side thin layer over the same
  `SessionCore` (documented in `mcp-bridge/design.md`, not duplicated here).

## The command tree

```text
azula pair <url> | devices | invite | invites | qr | link      # unchanged
azula mcp [--http BIND] [--session NAME] [--device URL]... [--name N] [--max-turns N]
azula message send  [--device D] [--session S] TEXT
azula message recv  [--device D] [--session S] [--wait SECS]
azula watch [--device D] [--session S] [--json]
azula ui render  [--device D] [--session S] [--surface ID] [--data-model JSON] FILE|-
azula ui update  [--device D] [--session S] --surface ID POINTER VALUE
azula ui delete  [--device D] [--session S] --surface ID
azula ui catalog
azula file send  [--device D] PATH [--caption TEXT]
azula run [--handoff on-error|always|never] [--hold MIN] -- CMD…       # D5
azula terminal [new|list|attach|kill] […]                              # D5
azula relay [--allow-legacy]                                           # D6 (alias: mailbox)
azula status [--json]
```

`Cli` (`cli/mod.rs`) is a `clap::Parser` with an `Option<Command>` plus a
flattened `legacy::ServeArgs` fallback: `None` (bare `azula`, no subcommand)
dispatches to `legacy::serve` unchanged — this is the one dispatch arm that
prints **no** deprecation notice, since the user typed nothing that names a
retired command. Every other `Command` variant maps 1:1 to a noun (`Mcp`,
`Run`, `Terminal`, `Message`, `Ui`, `File`, `Watch`, `Status`, `Relay`) or an
unchanged legacy noun (`Pair`, `Devices`, `Qr`, `Invite`, `Invites`, `Link`),
plus three `#[command(hide = true)]` variants — `Serve`, `ServeMcp`,
`Mailbox` — that print a stderr deprecation notice
(`print_deprecation_notice(old, new)`) and delegate to the replacement's own
run function. `azula mcp`'s own default *transport* selection (stdio unless
`--http`) subsumes the old `mcp`/`serve-mcp` split without needing a
deprecation notice at all — `--http` is just a flag on the new noun, and
`ServeMcpArgs`/`run_serve_mcp_alias` is the one alias that still needs its
own struct (kept field-for-field identical to the pre-restructure shape so
existing invocations parse unmodified).

`azula ui render --help`'s long form and the `render_ui` MCP tool's
description are attached **programmatically**, not via `#[command(long_about =
...)]`/`#[tool(description = ...)]` string literals, because both attribute
forms only accept literal tokens (`concat!` doesn't accept a `const` path
either) — see `cli::build_command`'s `mut_subcommand` calls and
`catalog.rs`'s module doc. `cli::build_command()` is called instead of the
plain derive (`Cli::command()`) so this attachment happens exactly once, at
the single spot both `run()` and every test that needs the built command
(`command_tree_builds_without_panicking`, `ui_render_help_carries_the_a2ui_catalog`)
share.

### Shared per-verb argument fragments

Every one-shot verb (`message send/recv`, `ui render/update/delete`, `file
send`, `watch`) flattens two small `clap::Args` structs:

- **`DeviceArg`** (`--device NAME`) — resolved by
  `SessionCore::resolve_target_device`: the name itself if given and known
  (live map or registry); the sole registered device if omitted and exactly
  one exists; a `Usage` error (exit 2) listing candidates, or explaining none
  are registered, otherwise.
- **`SessionArg`** (`--session NAME`, also `AZULA_SESSION` via `env =
  "AZULA_SESSION"` on the `clap::Arg`) — resolved by
  `cli::resolve_cli_session_name`, a pure function: an explicit value wins;
  absent, it resolves to the persistent session name `"cli"` — **not** an
  ephemeral one, unlike `azula mcp`'s own `--session`, which passes `None`
  straight through to `session::SessionKey::resolve` and gets a fresh
  ephemeral key per process. This is design.md D2's "one-shot CLI verbs
  ... session name `cli`... casual use from any terminal shares one 'CLI'
  conversation" — see
  [`session-identity-design.md`](session-identity-design.md#session-key-resolution-and-persistence-sessionrs)
  for the full session-naming story.

## Exit codes and error classification (`CoreError`)

Every `SessionCore` operation that can fail returns `Result<T, CoreError>`,
a three-variant enum that both layers translate independently:

| `CoreError` variant | Meaning | CLI exit code | MCP mapping |
|---|---|---|---|
| `Usage(String)` | Bad input, caught before any network activity (invalid ticket, malformed A2UI components, an oversize/unreadable file) | `2` | `CallToolResult::error` (the model sees it and can react) |
| `Operational(String)` | Runtime connectivity/lookup failure (unknown device, unreachable, a business-rule rejection like a closed `say` conversation) | `1` | `CallToolResult::error` |
| `Transport(String)` | A live-stream write failed after the connection was judged healthy | `1` | `ErrorData::internal_error` (protocol-level, matching the original tool bodies' `?`-propagated errors) |

`CoreError::exit_code()` is the one place this mapping lives; `cli::exit_core_error`
(`cli/mod.rs`) prints `error: {e}` to stderr and calls
`std::process::exit(e.exit_code())`. `bridge::tools::core_err_to_tool_result`
is the MCP-side mirror — see `mcp-bridge/design.md`.

## JSON output contracts

Every verb takes `--json`; the shapes are hand-rolled `serde_json::json!` at
each call site (`cli::print_json` — one `serde_json::to_string` + `println!`
per value) rather than a shared envelope type, since each verb's payload
shape is small and verb-specific:

| Verb | `--json` shape (one object unless noted) |
|---|---|
| `message send` | `{"status":"sent"\|"queued","device":…}` |
| `message recv` (drain) | one `{"device":…,"text":…}` per line |
| `message recv --wait` | lines as above, or `{"status":"timeout","device":…}` |
| `ui render` | `{"status":"rendered","device":…,"surface":…}` |
| `ui update` | `{"status":"updated","device":…,"surface":…,"pointer":…}` |
| `ui delete` | `{"status":"deleted","device":…,"surface":…}` |
| `ui catalog` | `{"catalog":"<the full A2UI_CATALOG prose>"}` |
| `devices` | array of `{"name":…,"fingerprint":…,"source":…,"relay":bool}` |
| `terminal list` | array of `{"name":…,"pid":…,"alive":bool,"node_id":…,"invite_url":…,"started_at":…}` |
| `status` | `{"machine_identity":{…},"devices":[…],"sessions":[…]}` (see below) |
| `watch --json` | one `WatchEvent` per line (below) |

### `azula watch --json` — the event model

`core::watch::WatchEvent` (`core/watch.rs`) is the JSONL contract: a
`#[serde(tag = "type")]` enum with five variants —

```json
{"type":"message","device":"phone","text":"hey"}
{"type":"ui_event","device":"phone","event":{"name":"roll","surfaceId":"dice-1","sourceComponentId":"rollBtn","context":{}}}
{"type":"file","device":"phone","name":"a.png","mime":"image/png","size":10,"path":"/tmp/a.png"}
{"type":"connected","device":"phone"}
{"type":"disconnected","device":"phone"}
```

`classify_inbox_line(device, line)` is a pure classifier that turns one raw
inbox line — as `core/device.rs`'s reader loop already produces (plain chat
text, a `ui-event: {...}` line, or a `[received file: NAME (MIME, SIZE
bytes) -> PATH]` line, optionally followed by ` caption: ...`) — into the
matching `WatchEvent`. Anything that doesn't match a recognized shape
(including `[rejected file: ...]`/`[failed to save received file ...]`)
degrades to a plain `message` event, same as `get_messages`/`wait_for_reply`
already treat it. `ui_event.event` carries the A2UI event payload verbatim
(parsed as `serde_json::Value`, not re-shaped) — the cli-surface spec's "carry
the A2UI event payload verbatim" requirement.

`cli::watch_cmd::run` is a thin poll loop on top: it holds one `SessionCore`
open (`core::establish`) for the process's lifetime, polls every 300 ms
(`POLL_INTERVAL`) for (a) a connected/disconnected transition per device
(diffed against a `HashMap<String, bool>` of last-seen state) and (b) new
inbox lines via `get_messages`, classifying and emitting each. `--device`
must name an already-known device up front (`resolve_target_device`,
checked once before the loop) — otherwise `watch` would sit forever matching
nothing, a footgun worth failing fast on rather than silently.

### `azula status --json`

`core::status::compute()` (`core/status.rs`) is side-effect-free and binds
**no endpoint** — cli-surface spec: "`status --json`... read the runtime
state files ... + registry; do not bind an endpoint." It reads:

- **Machine identity** — `identity::load_machine_secret_if_exists()`
  (read-only; never creates one). `{"machine_identity":{"present":false}}`
  when headless, or `{"present":true,"node_id":"<hex>"}`.
- **Devices** — the merged registry (`registry::load()`) unioned with the
  last-written runtime state file's device list (`core::state::read_state`),
  each tagged `source: "project"|"global"|"runtime"` (the last meaning
  "known only from a live process's state file, not either registry file" —
  e.g. a `--device` flag device that was never `azula pair`-ed).
- **Sessions** — every `.key` file under `session::sessions_dir()`
  (`~/.azula/sessions`, tagged `"named"`) and under
  `$TMPDIR/azula/sessions` (tagged `"ephemeral"` — note this directory is
  shared with `cli::terminal_cmd`'s runtime **state** files, which are
  `.json` not `.key`; `key_file_stem` filters on the `.key` extension so the
  two never collide in this listing).

The human-readable (non-`--json`) render (`render_human`) is a second, pure
function over the same `StatusReport` — `azula status` and `azula status
--json` are guaranteed to report the same facts because they share one
`compute()` call, only the rendering differs.

## `SessionCore`: the shared core

`SessionCore` (`core/mod.rs`) is the connection-management state one session
identity holds: a bound `Arc<Endpoint>`, the live `DeviceMap`
(`core::device`), this process's own certificate material, a separate
`relay_conns: DeviceMap` for cached relay connections (deliberately never
merged with `devices`, so dialing the relay never marks the phone itself as
connected — see [`relay-design.md`](relay-design.md)), and
`surface_state: HashMap<(device_name, surface_id), SurfaceState>` — this
session's own retained copy of each surface it rendered, used to coalesce an
offline `update_ui` into a full snapshot (also relay/design.md).

Two ways to build one:

- **`establish(label, device_urls, name, allow_legacy, session_name) ->
  Established`** — the full setup every real entry point uses: resolve the
  session key (`SessionKey::resolve`), bind the endpoint, mint the session
  cert (machine-signed or self-certified — see
  [`session-identity-design.md`](session-identity-design.md)), stand up
  the accept router (`LLM_ALPN` only — `azula mcp`/one-shot verbs never
  accept `TERM_ALPN`), preload the device registry into the map, spawn a
  background best-effort dial per known device, and spawn the 25 s
  redelivery loop that retries any disconnected device with mailbox-queued
  mail. Returns `Established { core, session, router }` — `session` and
  `router` are kept alive by the caller for their `Drop` side effects (an
  ephemeral session's key-file deletion; the router's accept loop).
- **`SessionCore::from_parts(...)`** — direct construction for a caller that
  already holds its own router (`bridge::tools::AzulaBridge::new`, and
  tests) — skips the dial/redelivery machinery `establish` sets up, since
  the MCP bridge's `setup_bridge()` (documented in `mcp-bridge/design.md`)
  does its own equivalent setup around the same `SessionCore`.

Every one-shot CLI verb calls `core::establish("cli", vec![], None, true,
Some(session_name))`, does its one operation, and lets `Established` drop —
closing the connection and, for an ephemeral session, deleting its on-disk
key file. `label` is a human tag (here always `"cli"`) written into the
runtime state file; it plays the same role `azula mcp --http`'s bind address
or `"stdio"` does for the bridge's own runtime state (see
`mcp-bridge/design.md`'s "Device registry + runtime state").

### Operations `SessionCore` exposes

`connect`, `list_devices`, `resolve_target_device`, `ensure_device`,
`lookup_device`, `send_message`, `send_file`, `get_messages`,
`wait_for_reply`, `set_name`, `say`, `render_ui`/`render_ui_outcome`,
`update_ui`/`update_ui_outcome`, `delete_ui`/`delete_ui_outcome`,
`disconnect`, `pairing_url` — one method per MCP tool from the pre-existing
catalog (`mcp-bridge/design.md`), plus the outcome-reporting variants
(`render_ui_outcome` etc.) that additionally report `SendOutcome::Sent` vs.
`Queued` so a caller can tell whether an A2UI call went out live or was
coalesced to the relay (`render_ui`/`update_ui`/`delete_ui` are thin
wrappers over the `_outcome` versions, discarding that bit, kept with their
original signature since `cli::ui` — outside this phase's file ownership at
extraction time — calls them expecting just the surface id). The relay
delivery-chain internals (`try_deliver_via_relay`, `ensure_relay`,
`send_snapshot_to_relay`, `retain_surface_state`,
`apply_data_model_pointer`) are documented in
[`relay-design.md`](relay-design.md), not repeated here.

This extraction is what moved from the old `bridge::device`/`bridge::state`
modules (cli-multi-session-relay phase 2, per `core/device.rs`'s module doc)
— both the MCP tool layer and the CLI verbs now share one implementation of
every one of these operations; `bridge::tools::AzulaBridge`'s 13 `#[tool]`
methods are pure formatting wrappers (deserialize MCP args, call the
matching `SessionCore` method, format the result or map the `CoreError`),
and so is every `cli::*` verb module (deserialize `clap::Args`, call the
matching method, print human text or `--json`). See `mcp-bridge/design.md`
for the full MCP tool catalog and their exact wording.

## The A2UI catalog: one string, four consumers

`catalog::A2UI_CATALOG` (`catalog.rs`) is the single prose string documenting
the A2UI basic-catalog component/prop vocabulary (STRUCTURE, per-component
props, INTERACTION, a worked EXAMPLE). It has exactly one home in the crate —
a test (`catalog_documents_every_known_component`) asserts every catalog
component name appears in the string, and the module doc calls out that
grepping for a distinctive substring like `"STRUCTURE:"` should find exactly
one hit. Four consumers reference it rather than duplicating it:

1. `azula ui catalog` — prints it directly (`--json` wraps it as
   `{"catalog": "..."}`).
2. `azula ui render --help` — `cli::build_command()` attaches it to the
   `render` subcommand's `long_about` programmatically (see "The command
   tree" above for why this can't be a `#[command(long_about = ...)]`
   literal).
3. The `render_ui` MCP tool's description — `bridge::tools::AzulaBridge::new`
   overwrites the tool router's generated description at construction time
   (same literal-attribute constraint as #2), prefixing
   `catalog::RENDER_UI_INTRO` (the short, tool-specific framing sentence).
4. The a2ui capability's own design page
   ([`a2ui/design.md`](../../../specs/a2ui/design.md)) remains canonical for the
   *renderer's* component contract and design tokens — this crate-embedded
   string is a prose mirror aimed at an LLM with only shell/MCP access, kept
   in sync by hand (no generation step ties them together today; a drift
   here is a docs bug, not a wire-format one, since the app renderer never
   reads this string).

This is the a2ui capability's pre-existing "three places" catalog-sync rule
(see `a2ui/design.md`) extended to a fourth consumer that shares the same
source string, per cli-surface spec's "A2UI Catalog Embedded in the CLI."

## Client-side validation before any network activity

`core::validate_a2ui_components` (`core/mod.rs`) — a JSON array containing
exactly one component with `"id":"root"` — runs in **both** layers before
anything is sent: `SessionCore::render_ui_outcome` calls it first thing, and
`cli::ui::parse_and_validate_components` calls the identical function against
stdin/file input before `render()` ever calls `core::establish` (so a bad
payload never binds an endpoint or dials anyone — the cli-surface spec's
"Missing root rejected locally" scenario, and `ui.rs`'s own
`stdin_payload_missing_root_is_rejected` test). This is the one validation
rule specified as shared client-side; JSON pointer application
(`set_at_json_pointer`, used by the relay-coalescing path) and file-size caps
(`filexfer::MAX_FILE_BYTES`) are separate, narrower checks documented where
they're used.

## Legacy aliases

`cli/legacy.rs` holds every command the restructure didn't touch
(`pair`/`devices`/`qr`/`invite`/`invites`/`link`) plus the three deprecated
entry points (`serve`, `serve-mcp` via `mcp_cmd::run_serve_mcp_alias`,
`mailbox`). Each deprecated alias's `clap::Args` struct is kept
field-for-field identical to its pre-restructure shape (see
`ServeMcpArgs`/`MailboxArgs`) precisely so an existing script's invocation
keeps parsing unmodified through the one release these aliases are promised
to survive (cli-surface spec: "for one release cycle"). `azula link` itself
follows the same split as the top-level `azula relay`/`azula mailbox`
commands: `LinkArgs` in `cli/legacy.rs` defines `#[arg(long, alias =
"mailbox")] relay: bool` — `azula link --relay` is the primary spelling,
`azula link --mailbox` a clap-level alias for the exact same field, matching
`relay/spec.md`'s "Relay Subsumes the Mailbox Role" requirement.

## Tests

- `cli/mod.rs` — `resolve_cli_session_name` (explicit vs. `cli` default),
  `command_tree_builds_without_panicking` (`clap::Command::debug_assert`
  catches a `mut_subcommand` name drifting from its derived name),
  `ui_render_help_carries_the_a2ui_catalog`.
- `cli/ui.rs` — the six `parse_and_validate_components`/`validate_a2ui_components`
  unit tests (valid, missing root, non-array, invalid JSON — client- and
  core-side both, since the two are meant to reject identically).
- `core/watch.rs` — `classify_inbox_line`'s five shapes (plain text,
  `ui-event:`, received-file with/without caption, rejected-file fallback)
  and `WatchEvent`'s exact `--json` serialization per variant.
- `core/status.rs` — `compute()` against seeded temp registry/state/session
  directories (headless case: no machine key), and a machine-identity-present
  case asserting the hex `node_id` matches the minted key.
- Run: `cargo test` from `azula-cli/`.
