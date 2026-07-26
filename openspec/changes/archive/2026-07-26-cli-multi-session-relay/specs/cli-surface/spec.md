# cli-surface — delta

## ADDED Requirements

### Requirement: Noun-Verb Command Taxonomy
The azula CLI SHALL expose its functionality as noun-verb subcommands: `azula message send|recv`, `azula ui render|update|delete|catalog`, `azula file send`, `azula watch`, `azula run`, `azula terminal [new|list|attach|kill]`, `azula mcp`, `azula relay`, `azula status`, and the existing `pair`/`devices`/`invite`/`invites`/`qr`/`link`. The legacy `serve-mcp`, `mcp` (old flag semantics), `serve`, and `mailbox` entry points SHALL remain as deprecated aliases for one release cycle and then be removed.

#### Scenario: Legacy alias still works
- **WHEN** a user runs `azula serve-mcp` after this change ships
- **THEN** it behaves as the corresponding new command and prints a deprecation notice to stderr

#### Scenario: Discoverability from help alone
- **WHEN** a user or LLM runs `azula --help` and `azula <noun> --help`
- **THEN** every capability reachable over MCP is reachable via a documented CLI verb

### Requirement: CLI and MCP Share One Core
The CLI verbs and the MCP tools SHALL be thin layers over one shared session core (connection management, registry, relay/mailbox delivery, A2UI send, inbox), so a behavior available to an MCP client is available to a script and vice versa, with identical offline semantics.

#### Scenario: Same offline behavior in both layers
- **WHEN** `azula message send` and the `send_message` MCP tool each target an unreachable device
- **THEN** both queue through the same delivery chain and report the message as queued identically

### Requirement: JSON Output Contracts
Every CLI verb SHALL support `--json` machine-readable output. `azula watch --json` SHALL stream one JSON object per line for each inbox event with a `type` field distinguishing at least `message`, `ui_event`, `file`, `connected`, and `disconnected`, plus the source `device`; `ui_event` objects SHALL carry the A2UI event payload verbatim. `azula status --json` SHALL report the machine identity, known devices with connected state, and active local sessions.

#### Scenario: Blackjack-style script loop
- **WHEN** a script runs `azula ui render` and then follows `azula watch --json`
- **THEN** a tap on the rendered surface arrives as a parseable JSONL `ui_event` line carrying the A2UI event payload

### Requirement: A2UI Catalog Embedded in the CLI
`azula ui catalog` and `azula ui render --help` SHALL print the A2UI component catalog from the same source string the MCP `render_ui` tool description uses, so the CLI, the MCP tool, the app renderer, and the a2ui capability page stay in lockstep with a single agent-facing catalog source in the crate.

#### Scenario: LLM learns A2UI from the CLI
- **WHEN** an LLM with shell access but no MCP connection runs `azula ui catalog`
- **THEN** it receives the full component/prop vocabulary needed to compose a valid `azula ui render` call

### Requirement: UI Verbs Accept Stdin and Files
`azula ui render` SHALL accept the components JSON (and optional data model) as a file path or `-` for stdin; `azula ui update` SHALL take an RFC 6901 JSON pointer and a JSON value. Invalid component trees SHALL be rejected client-side with the same root-component validation the MCP tool applies.

#### Scenario: Render from stdin
- **WHEN** a script pipes a components array with one `"id":"root"` entry to `azula ui render -`
- **THEN** the surface renders on the target device without a temporary file

#### Scenario: Missing root rejected locally
- **WHEN** the piped components array has no `"id":"root"` component
- **THEN** the command exits nonzero with a validation error and sends nothing
