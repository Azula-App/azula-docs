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

azula is split across sibling git repos, all checked out under one parent
directory (e.g. `~/Developer/azula/`). There is no monorepo — each repo builds,
versions, and deploys on its own.

- `azula-app/` — Kotlin Multiplatform (Amper) + Compose Multiplatform.
  - `shared/` — the UI, state, markdown, and the iroh transport
    (`expect`/`actual`). `src@jvmAndAndroid` uses `computer.iroh:iroh`; `src@ios`
    bridges to a Swift `IrohLib` impl.
  - `android-app/`, `jvm-app/`, `ios-app/` — thin per-platform entry points.
  - `design/`, `e2e/` — design mock notes and Maestro flows; the `./kotlin`
    wrapper and `project.yaml` live at this repo's root.
- `azula-cli/` — Rust iroh server (the `azula` binary): `serve` (MCP client + PTY
  shell) and `serve-mcp` (MCP server bridging an LLM to the app over iroh), plus
  `pair`. Sources in `src/`, extra notes in `docs/`.
- `azula-site/` — Cloudflare Worker for azula.app (landing + session-link URLs +
  deeplink well-known files). Sources in `src/`.
- `iroh-kmp/` — the iroh SDK for KMP (package `app.azula.iroh`): a minimal Rust +
  UniFFI crate wrapping iroh, generated into a Kotlin Multiplatform library by
  [Gobley](https://gobley.dev) and published to mavenLocal. `azula-app/shared`
  consumes it (jvm + android) instead of `computer.iroh:iroh`; this is what makes
  real iroh work on Android. See `azula-docs/docs/iroh-kmp.md`.
- `azula-docs/` — cross-repo documentation and this working agreement. Holds the
  shared CLAUDE files and the prose docs (`docs/`) that aren't tied to a single
  repo's build.

## Build / verify

Each command runs inside its own repo, not a shared root.

- Kotlin (`azula-app/`, Amper wrapper): `./kotlin build -m jvm-app`,
  `./kotlin check -m shared`. Run from the `azula-app/` root (the `./kotlin`
  wrapper is here). The wrapper downloads its toolchain + deps, so builds need
  network — disable the command sandbox.
- Rust (`azula-cli/`): `cargo build`.
- Worker (`azula-site/`): `npm install && npm run typecheck`.
- iroh SDK (`iroh-kmp/`): `./gradlew publishToMavenLocal` — needs **JDK 17**
  (AGP 8.7; e.g. `JAVA_HOME=…/zulu-17…`), the Android NDK r28+, and Rust with the
  Android/iOS targets. Re-run after changing the crate so azula-app picks up the
  new artifact. See `docs/iroh-kmp.md`.

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
  `azula-app/shared/composeResources/font/`.
- Don't commit or deploy unless asked; branch first if on `main`.
