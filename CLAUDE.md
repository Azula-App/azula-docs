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

- `azula-app/` — Kotlin Multiplatform (Amper) + Compose Multiplatform. Wired with
  **Metro** compile-time DI (one flat graph) and split into **api/real** feature
  modules — see [`docs/architecture-di.md`](docs/architecture-di.md) for the DI +
  module conventions and how to add a feature module.
  - `core/` — dependency leaf (the Metro `AppScope`, `RecoveryPhrase`).
  - api/real feature pairs: `network-api`/`network-real` (iroh transport
    interfaces / the real iroh-kmp transport + peer stores),
    `terminal-api`/`terminal-real` (the `TerminalEmulator` engine / terminal UI +
    real sessions — see [`docs/terminal.md`](docs/terminal.md)),
    `persistence-api`/`persistence-real` (message/profile stores), and
    `notification-api`.
  - standalone libs: `a2ui` (A2UI model/codec/renderer), `theme`, `ui-common`,
    `markdown`, `link` (deeplink parsing + QR).
  - `mock-support/` — the fakes kept out of the real app: `FakeTransport` +
    `buildMockState()`, used only by the `-mock` apps.
  - `shared/` — the assembler: `AppGraph`, the `AzulaState` coordinator and its
    extracted services (decomposition **complete** — see `architecture-di.md`),
    and the screen UI.
  - `android-app/`, `jvm-app/`, `ios-app/` — thin per-platform entry points that
    build the graph. Each has a sibling `-mock` app (`android-app-mock`, …) that
    injects the fakes for UI tests.
  - `design/`, `e2e/` — design mock notes and Maestro flows; the `./kotlin`
    wrapper and `project.yaml` live at this repo's root.
- `azula-cli/` — Rust cargo workspace. The root `azula` package (lib + binary):
  `serve` (MCP client + PTY shell), `serve-mcp` / `mcp` (HTTP / stdio MCP server
  bridging an LLM to the app over iroh — see
  [`docs/mcp-bridge.md`](docs/mcp-bridge.md)), plus `pair`/`devices`/`qr`. The
  `demos/` member builds the separate `azula-demos` binary (`demo-ui`,
  `blackjack`) so demo tools don't ship in the production server. Sources in
  `src/`, extra notes in `docs/`.
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

## Keeping docs in sync

Plan files (`~/.claude/plans/…`) are **ephemeral** — they get overwritten on the
next task, so design must not live only there. **Whenever you do design or
architecture work — i.e. whenever you write or overwrite a plan doc — capture the
durable version in this repo (`azula-docs`):** add or update a prose page under
`docs/` and link it from the relevant CLAUDE.md. Treat "I'm about to overwrite the
plan doc" as the trigger to update `azula-docs`. Areas that should each keep an
up-to-date `docs/` page: the DI/module architecture (`docs/architecture-di.md`),
the terminal emulator (`docs/terminal.md`), identity backup / recovery phrase
(`docs/identity.md`), the MCP↔iroh bridge — `serve-mcp` HTTP + the stdio `mcp`
subcommand, its tools, and A2UI usage (`docs/mcp-bridge.md`), streamed media
attachments (`docs/media-transfer.md`), the invitation payload / share-link
format and its verification model (`docs/invitations.md`), and the A2UI
component catalog + neon-glass design system (`docs/a2ui.md`). The testing
strategy — which layer (unit / Compose UI test / Maestro) owns which kind of
coverage — is `docs/testing.md`; read it before adding tests. Known tech debt
and refactor candidates live in `docs/tech-debt.md` — check it before starting
structural work, and delete entries you resolve.

## Conventions

- Custom fonts fall back to system families until `.ttf` are added to
  `azula-app/shared/composeResources/font/`.
- Don't commit or deploy unless asked; branch first if on `main`.
