# azula — working agreement

This is the cross-repo working agreement for azula. It lives in `azula-docs`
(the docs repo) and is served to every agent via `CLAUDE.md` / `AGENTS.md`
pointers. Durable design truth lives beside it in `openspec/specs/`; in-flight
and planned work lives in `openspec/changes/`.

## Model usage (cost)

**Delegate implementation work to Sonnet; reserve Opus for orchestration and
hard reasoning.** The main loop runs on Opus — keep it for planning,
architecture, cross-cutting decisions, and synthesizing results. For anything
that is well-scoped or token-heavy (writing/iterating a module, build/test
loops, log-grinding, exploratory tool work like emulator/simulator runs), spawn
a subagent with `model: "sonnet"` (Agent tool) so the verbose output and grunt
work stay off the Opus context. Only do such work inline on Opus when delegation
would clearly cost more than it saves (tiny edits, a single decisive command).

## Project map

azula is split across sibling git repos, all checked out under one parent
directory (e.g. `~/Developer/azula/`). There is no monorepo — each repo builds,
versions, and deploys on its own.

- `azula-app/` — Kotlin Multiplatform (Amper) + Compose Multiplatform. Wired with
  **Metro** compile-time DI (one flat graph) and split into **api/real** feature
  modules — see
  [`openspec/specs/architecture-di/design.md`](specs/architecture-di/design.md)
  for the DI + module conventions and how to add a feature module.
  - `core/` — dependency leaf (the Metro `AppScope`, `RecoveryPhrase`).
  - api/real feature pairs: `network-api`/`network-real` (iroh transport
    interfaces / the real iroh-kmp transport + peer stores),
    `terminal-api`/`terminal-real` (the `TerminalEmulator` engine / terminal UI +
    real sessions — see
    [`openspec/specs/terminal/design.md`](specs/terminal/design.md)),
    `persistence-api`/`persistence-real` (message/profile stores), and
    `notification-api`.
  - standalone libs: `a2ui` (A2UI model/codec/renderer), `theme`, `ui-common`,
    `markdown`, `link` (deeplink parsing + QR).
  - `mock-support/` — the fakes kept out of the real app: `FakeTransport` +
    `buildMockState()`, used only by the `-mock` apps.
  - `shared/` — the assembler: `AppGraph`, the `AzulaState` coordinator and its
    extracted services (decomposition **complete** — see `architecture-di`),
    and the screen UI.
  - `android-app/`, `jvm-app/`, `ios-app/` — thin per-platform entry points that
    build the graph. Each has a sibling `-mock` app (`android-app-mock`, …) that
    injects the fakes for UI tests.
  - `design/`, `e2e/` — design mock notes and Maestro flows; the `./kotlin`
    wrapper and `project.yaml` live at this repo's root.
- `azula-cli/` — Rust cargo workspace. The root `azula` package (lib + binary),
  published to Homebrew/crates.io/npm off a `v*` tag — see
  [`cli-distribution-design.md`](changes/cli-multi-session-relay/design-pages/cli-distribution-design.md).
  Noun-verb command surface (`message`, `ui`, `file`, `watch`, `status`,
  `mcp [--http]`, `run`, `terminal`, `relay`, plus `pair`/`devices`/`qr`/
  `invite`/`invites`/`link` — see
  [`cli-surface-design.md`](changes/cli-multi-session-relay/design-pages/cli-surface-design.md))
  over one shared `SessionCore`; every process binds its own per-session
  identity certified by a stable per-machine key (see
  [`session-identity-design.md`](changes/cli-multi-session-relay/design-pages/session-identity-design.md)).
  `azula mcp [--http BIND]` (HTTP or stdio MCP server bridging an LLM to the
  app over iroh — see
  [`openspec/specs/mcp-bridge/design.md`](specs/mcp-bridge/design.md)) is the
  successor to the pre-restructure `serve-mcp`/`mcp` split; `serve-mcp`,
  `mcp` (old flag shape), `serve`, and `mailbox` remain as deprecated aliases
  for one release. `azula run`/`azula terminal` host PTY sessions (see
  [`openspec/specs/terminal/design.md`](specs/terminal/design.md)); `azula
  relay` (alias: `mailbox`) is the always-on store-and-forward + agent-chat +
  A2UI-snapshot sibling (see
  [`relay-design.md`](changes/cli-multi-session-relay/design-pages/relay-design.md)).
  The `demos/` member builds the separate `azula-demos` binary (`demo-ui`,
  `blackjack`) so demo tools don't ship in the production server. Sources in
  `src/`, extra repo-local notes in `docs/`. **Note:** `azula-cli/README.md`'s
  Install section reflects this restructure; the rest of the file
  (Build/Run/tool catalog/wire-protocol/crate-layout, below "## Build") still
  documents the pre-restructure `serve`/`serve-mcp`/`pair`-only CLI and needs
  a pass to catch up — see the design pages linked above for current reality
  in the meantime. (The `cli-surface`/`session-identity`/`relay`/
  `cli-distribution` design pages linked above are staged under this change
  until it archives, at which point they merge into `openspec/specs/`
  alongside `mcp-bridge`/`terminal` above.)
- `azula-site/` — Cloudflare Worker for azula.app (landing + session-link URLs +
  deeplink well-known files). Sources in `src/`.
- `iroh-kmp/` — the iroh SDK for KMP (package `app.azula.iroh`): a minimal Rust +
  UniFFI crate wrapping iroh, generated into a Kotlin Multiplatform library by
  [Gobley](https://gobley.dev) and published to **Maven Central** (by CI, on a
  `v*` tag). `azula-app`'s `network-real` and `android-app` modules consume it by
  published version instead of `computer.iroh:iroh`; this is what makes real iroh
  work on Android. See
  [`openspec/specs/iroh-kmp/design.md`](specs/iroh-kmp/design.md).
- `azula-docs/` — cross-repo documentation and this working agreement. Holds the
  shared CLAUDE/AGENTS files, the OpenSpec tree (`openspec/`), and the shared
  agent skills (`.claude/skills/`).

## OpenSpec (specs and changes)

This project uses [OpenSpec](https://github.com/Fission-AI/OpenSpec) for
spec-driven development. Everything lives under `azula-docs/openspec/` (the
parent checkout symlinks `openspec -> azula-docs/openspec` so the CLI and
slash commands work from the parent too).

- `openspec/specs/<capability>/spec.md` — normative requirements
  (`### Requirement:` + SHALL + `#### Scenario:` WHEN/THEN). What the system
  SHALL do.
- `openspec/specs/<capability>/design.md` — the deep prose companion: wire
  formats, rationale, test vectors, implementation notes. Where a spec.md and
  its design.md disagree, spec.md is the intent.
- `openspec/changes/<name>/` — in-flight or planned work: `proposal.md`
  (why/what), optional `design.md`, `tasks.md` checklist, and delta specs
  (`specs/<capability>/spec.md` with ADDED/MODIFIED/REMOVED requirements).
- `openspec/changes/archive/` — completed changes, kept as history.

Authoring gotcha: `openspec validate --strict` only scans the **first
physical line** of a requirement's body for SHALL/MUST — keep the keyword in
the first line (don't hard-wrap it onto line 2), and give every requirement at
least one `#### Scenario:` (exactly four hashes).

Workflow (slash commands installed in `.claude/commands/opsx/`, skills in
`.claude/skills/openspec-*`): `/opsx:explore` to think, `/opsx:propose` to
start a change, `/opsx:apply` to implement its tasks, `/opsx:archive` when it
ships (this merges delta specs into the main specs). CLI: `openspec list`,
`openspec validate --all`, `openspec archive <name>`.

**Keeping specs in sync:** plan files (`~/.claude/plans/…`) are ephemeral —
design must not live only there. Whenever you do design or architecture work,
capture the durable version here: requirement-level changes go through an
OpenSpec change (delta specs → archive merges them), and prose detail goes in
the capability's `design.md`. Treat "I'm about to overwrite the plan doc" as
the trigger. Before starting structural work, check `openspec list` and skim
`openspec/changes/` — known tech debt and refactor candidates live there as
change proposals; archive entries you resolve.

## Agent mirrors

Claude remains the canonical setup, but compatible coding agents should read the
same agreement through symlinks: `AGENTS.md -> CLAUDE.md` where a `CLAUDE.md`
exists, and `.agents -> .claude` where a `.claude/` directory exists. Keep those
mirrors as symlinks rather than separate copies so the instructions cannot drift.

## Build / verify

Each command runs inside its own repo, not a shared root.

- Kotlin (`azula-app/`, Amper wrapper): `./kotlin build -m jvm-app`,
  `./check -m shared`. Run from the `azula-app/` root (both wrappers are here).
  The wrapper downloads its toolchain + deps, so builds need network — disable
  the command sandbox.

  **Never run `./kotlin run -m jvm-app` (or the built app) unisolated against
  the real network for anything other than your own primary identity** — it
  hardcodes `~/.azula` and, on macOS, the login Keychain. To stand up a second,
  disposable desktop instance (device-linking/sync testing, a second "device"
  on the same machine), set `AZULA_DATA_DIR=<scratch-dir>` first — it redirects
  every file **and** key `jvm-app` would otherwise write, unset is byte-for-byte
  today's behavior, and two different scratch dirs never interfere. See
  `openspec/specs/testing/design.md`, "Isolating a second `jvm-app` desktop
  instance", for the full mechanism and rationale.

  **Run checks through `./check`, not `./kotlin check` directly.** `./check` is
  a thin wrapper that takes an exclusive lock and passes everything else through.
  Two concurrent checks fight over the one iOS simulator: the loser logs
  `CoreSimError 405: Unable to boot device in current state: Booted`, and a run
  that takes ~30 s uncontended was measured at **1110 s** while another check was
  running. The lock makes the second caller wait instead. It also tolerates the
  known post-`PASSED` simulator exit (exit 149 / boot timeout), but only when
  the log positively shows tests ran and passed — a compile error emits no
  success marker and so can never be suppressed. `KOTLIN_CHECK_STRICT=1` disables
  that tolerance; `--no-lock` disables the lock. See
  `openspec/specs/testing/design.md`, "Known flakes".
- Rust (`azula-cli/`): `cargo build`.
- Worker (`azula-site/`): `npm install && npm run typecheck`.
- iroh SDK (`iroh-kmp/`): `./gradlew publishToMavenLocal` — needs **JDK 17**
  (AGP 8.7; e.g. `JAVA_HOME=…/zulu-17…`), `ANDROID_HOME` pointing at the SDK, the
  Android NDK r28+, and Rust with the Android/iOS targets. See
  `openspec/specs/iroh-kmp/design.md`.

  **`publishToMavenLocal` does not feed azula-app.** Amper resolves
  `app.azula.iroh:iroh-kmp` from Maven Central only — it never consults `~/.m2`
  (a version present only there fails with "Unable to *download* checksums") —
  and Central versions are immutable, so re-publishing an existing version is a
  no-op for the app. To get a crate change into azula-app: bump `VERSION_NAME` in
  `iroh-kmp/gradle.properties`, publish that **new** version to Central, then bump
  the coordinate in `azula-app/network-real/module.yaml` (two entries) and
  `azula-app/android-app/module.yaml`.

  To try a local SDK build against the app first, temporarily add a top-level
  `repositories:` block listing `- mavenLocal` to those two module.yaml files;
  Amper then resolves the local artifact. Keep it out of commits — a stale local
  artifact would silently outrank the published one, which is exactly the drift
  that let a broken SDK ship unnoticed.

## azula device registry (MCP bridge state)

`azula mcp` + `azula pair <url>` persist paired devices as JSON the agent
can read:

- project-local `<worktree-root>/.azula/devices.json` — git-worktree-aware (first
  ancestor with a `.git`); `azula pair` writes here inside a repo,
- global `~/.azula/devices.json` — fallback / `--global`; reads merge global then
  project (project wins by name),
- **relay hints** — a companion `relay-hints.json` (or `global-relay-hints.json`
  next to the global file) sits beside each `devices.json`, mapping device
  name to a learned relay connect ticket (`registry::relay_for`/`set_relay`)
  — a sibling file rather than a new field on `devices.json`'s own `Device`
  entries (several accept-side call sites construct that struct exhaustively
  — see
  [`relay-design.md`](changes/cli-multi-session-relay/design-pages/relay-design.md#relay-hint-how-a-session-learns-the-relays-ticket)
  for why). Same project/global precedence as `devices.json` itself. `azula
  devices --json` surfaces whether a hint is known per device as a `relay`
  boolean.
- runtime `$TMPDIR/azula/bridge.json` — a running bridge's `{bind, pid, devices}`.

To see which devices are paired/connected, read those files.

## azula machine + session identity, and local session state

Since cli-multi-session-relay, a bridge/CLI process's *own* identity is no
longer one persistent key — see
[`session-identity-design.md`](changes/cli-multi-session-relay/design-pages/session-identity-design.md)
for the full model. In brief, the files an agent might need to read or
reason about:

- `~/.azula/machine.key` — the stable per-machine root every session's
  certificate chains to. Adopted in place from a pre-existing
  `~/.azula/bridge.key` on first use (same endpoint id, `bridge.key` left
  untouched); read-only from any session-establishment code path (never
  auto-created merely by a session starting — only explicit pairing-side
  flows like `azula invite --bridge`/`start_pairing` may create it).
- `~/.azula/sessions/<name>.key` — a **named**, persistent session key
  (`--session NAME` / `AZULA_SESSION`); one-shot CLI verbs default to the
  shared name `cli`. `$TMPDIR/azula/sessions/<name>.key` — an **ephemeral**
  session key (the default for `azula mcp`/`azula run`/`azula terminal`),
  deleted on clean process exit.
- `$TMPDIR/azula/sessions/<name>.json` — a **detached** `azula terminal new`
  host's runtime state (`{name, pid, endpoint_id, invite_url, started_at}`);
  read by `azula terminal list`/`kill`. Distinct from the `.key` file of the
  same name in the same directory (state vs. key material).
- `azula status [--json]` reads all of the above (plus `devices.json`) and
  binds no endpoint of its own — the fastest way for an agent to answer "is
  there a machine identity here, what's paired, what sessions are running"
  without side effects.

## Design system

[`openspec/specs/design-system/design.md`](specs/design-system/design.md) is
**normative for every visual value** across all repos — the neon-glass palette,
typography, spacing, radius, glow, motion and brand. Where code and that page
disagree, the page is the intent and the code is the bug.

Do **not** invent colors, sizes or radii, and do not read tokens out of whichever
file is nearest. The palette is duplicated in six derived copies (`Color.kt`,
`A2uiTokens.kt`, `azula-site/src/pages.ts`, `azula-site/src/icon.ts`,
`store-listing-assets/scripts/gen.py`, `azula-app/design/icon/*.svg`), they use
three different naming schemes for the same hexes, and the same word means
different values in different layers. §10 of that page maps every current name to
its canonical one; §11 lists the known divergences. Changing a token means
changing the page first, then the derived copies in §13.

## Conventions

- Custom fonts fall back to system families until `.ttf` are added to
  `azula-app/shared/composeResources/font/`.
- A user-observable change to azula-app updates `azula-app/CHANGELOG.md` under
  `## [Unreleased]` **in the same commit** — both tiers: the `### Store notes`
  block (shipped verbatim to Play/TestFlight/App Store, under 500 bytes) and the
  detailed entry under `### Added` / `### Fixed` / etc. Only what a user could
  notice belongs there; dependency bumps, refactors, tests, CI, and docs do not.
  Cutting a release fails if either tier is empty — see
  [`specs/release-notes/`](specs/release-notes/).
- Land finished work on `main` in the same session: once a change is
  implemented and verified, commit it and get it onto `main` (push directly for
  small/doc changes; merge the worktree branch for larger ones), then clean up
  the worktree and branch. Don't leave uncommitted edits or stranded local
  branches behind. The exception is anything that ships: azula-site
  auto-deploys on push to `main`, and app/CLI releases are their own flow — get
  an explicit go-ahead before a push that deploys or releases.
- Never switch branches in the shared checkouts: sessions run from the parent
  directory (not a git root) and share each sibling repo's working tree, so an
  in-place `git checkout -b` changes files under every concurrent session.
  When making code changes, create a worktree instead:
  `git -C <repo> worktree add ../.worktrees/<repo>--<change> -b <change>`,
  work there, and `git -C <repo> worktree remove ../.worktrees/<repo>--<change>`
  once merged. `.worktrees/` at the parent-checkout root is the shared home for
  these (it's outside every repo, so nothing needs gitignoring). The harness's
  automatic worktree isolation can't be used here because the parent checkout
  isn't a git repo.
