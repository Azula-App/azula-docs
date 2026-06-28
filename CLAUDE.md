# azula — working agreement

## Model usage (cost)

**Delegate implementation work to Sonnet; reserve Opus for orchestration and hard reasoning.**
The main loop runs on Opus — keep it for planning, architecture, cross-cutting
decisions, and synthesizing results. For anything that is well-scoped or
token-heavy (writing/iterating a module, build/test loops, log-grinding,
exploratory tool work like emulator/simulator runs), spawn a subagent with
`model: "sonnet"` (Agent tool) so the verbose output and grunt work stay off the
Opus context. Only do such work inline on Opus when delegation would clearly cost
more than it saves (tiny edits, a single decisive command).

## Project map

- `shared/` — Kotlin Multiplatform (Amper) + Compose Multiplatform UI, state,
  markdown, and the iroh transport (`expect`/`actual`). `src@jvmAndAndroid` uses
  `computer.iroh:iroh`; `src@ios` bridges to a Swift `IrohLib` impl.
- `android-app/`, `jvm-app/`, `ios-app/` — thin per-platform entry points.
- `azula-cli/` — Rust iroh server: `serve` (MCP client + PTY shell) and
  `serve-mcp` (MCP server bridging an LLM to the app over iroh).
- `site/` — Cloudflare Worker for azula.app (landing + session-link URLs +
  deeplink well-known files).

## Build / verify

- Kotlin (Amper wrapper): `./kotlin build -m jvm-app`, `./kotlin check -m shared`.
  Run from the repo root (the `./kotlin` wrapper is here). The wrapper downloads
  its toolchain + deps, so builds need network — disable the command sandbox.
- Rust: `cd azula-cli && cargo build`.
- Worker: `cd site && npm install && npm run typecheck`.

## azula device registry (MCP bridge state)

`azula serve-mcp` + `azula pair <url>` persist paired devices as JSON the agent
can read:

- project-local `<worktree-root>/.azula/devices.json` — git-worktree-aware (first
  ancestor with a `.git`); `azula pair` writes here inside a repo,
- global `~/.azula/devices.json` — fallback / `--global`; reads merge global then
  project (project wins by name),
- runtime `$TMPDIR/azula/bridge.json` — a running bridge's `{bind, pid, devices}`.

To see which devices are paired/connected, read those files.

## Conventions

- Custom fonts fall back to system families until `.ttf` are added to
  `shared/composeResources/font/`.
- Don't commit or deploy unless asked; branch first if on `main`.
