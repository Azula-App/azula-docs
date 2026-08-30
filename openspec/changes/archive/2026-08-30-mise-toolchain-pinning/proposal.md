# One pinned toolchain per repo, via mise

## Why

Every repo in this checkout pins its toolchain twice, in two places that
disagree, and neither place is authoritative for a developer's shell.

CI pins per-ecosystem in each workflow: `setup-java` at JDK 21 for
`azula-app`, `setup-java` at JDK 17 for `iroh-kmp`, `setup-node` at 22 for
`azula-site`, `dtolnay/rust-toolchain@stable` for the Rust repos. Locally
there is nothing per-repo at all — only a global `~/.config/mise/config.toml`
with every tool set to `latest`, which today resolves to node 26 against CI's
node 22, and to a JDK that matches neither of the two the checkout needs.

That gap is not theoretical. `azula-app` needs JDK 21 and `iroh-kmp` needs
JDK 17 **in the same parent checkout**, which is why
[`project.md`](../../project.md) carries a manual
`JAVA_HOME=…/zulu-17…` instruction and why the `iroh-kmp` spec's publish
scenario is written around the operator setting `JAVA_HOME` by hand. A
per-directory toolchain manager makes that instruction unnecessary rather than
merely documented.

Sal already uses mise as the environment manager everywhere. Nothing in this
checkout takes advantage of it.

## What Changes

- **A `mise.toml` in every repo**, declaring exact versions — not major-version
  ranges — for the tools that repo actually builds with:

  | Repo | Pins |
  |---|---|
  | `azula-app` | `java = "temurin-21.0.12+8.0.LTS"` |
  | `iroh-kmp` | `java = "temurin-17.0.20+8"`, `rust = "1.98.0"` |
  | `azula-cli` | `rust = "1.98.0"`, `node = "24.20.0"` (the npm publish job) |
  | `azula-site` | `node = "22.23.2"` |
  | `azula-openclaw` | `node = "22.23.2"` |
  | `azula-docs` | `node = "22.23.2"` (for the `openspec` CLI) |

  Exact pins because a major-version pin still lets local and CI land on
  different patch releases, which is the smaller version of the bug this change
  exists to kill.

  Each pin preserves the major its repo uses today, which means the checkout
  keeps **two node majors** — 24 in `azula-cli`, 22 elsewhere. Consolidating
  them is a real question but a separate one; folding it in here would hide a
  behavior change inside a reproducibility change.

- **CI resolves from that same file.** Each workflow's `setup-node` /
  `setup-java` / `rust-toolchain` step is replaced by `jdx/mise-action`, so a
  version is declared once and consumed by both a developer's shell and the
  runner. Where a workflow needs a tool mise should not own — the Android NDK,
  Xcode, Docker for `cross` — that stays as it is; this change does not try to
  make mise the manager of everything.

- **Rust cross-compilation targets become an explicit step.** Both Rust repos
  currently get their targets from `dtolnay/rust-toolchain`'s `targets:` input
  (`azula-cli`'s per-matrix target, `iroh-kmp`'s six Android/iOS targets). mise
  installs toolchains, not rustup targets, so those move to an explicit
  `rustup target add` step rather than disappearing.

- **Two unpinned actions get fixed on the way past.**
  `azula-cli/release.yml` references `dtolnay/rust-toolchain@stable` and
  `actions/setup-node@v4` by mutable tag rather than by commit SHA, unlike
  every other action in the checkout. Both are replaced by this change, and
  `project.md` gains the SHA-plus-version-comment rule as a stated convention
  so the next one is caught in review.

- **`azula-docs` gets a `mise.toml` too**, which incidentally fixes the
  `openspec` CLI: it is not installed globally, and the working agreement's
  instruction to run `openspec list` / `openspec validate --all` currently only
  works via `npx -p @fission-ai/openspec`. Pinning node and declaring the CLI
  makes the documented commands run as written.

- **The manual `JAVA_HOME` dance retires.** `project.md`'s build/verify section
  and the `iroh-kmp` spec's publish scenario stop instructing the operator to
  point `JAVA_HOME` at a JDK 17 install, because `cd iroh-kmp` already selects
  it.

- **`project.md` gains a short toolchain convention** stating the rule for new
  repos: declare exact versions in `mise.toml`, and have CI read them from
  there.

Not in scope: adopting mise tasks as a build-command runner (the repos keep
`./kotlin check`, `cargo build`, `npm run typecheck`), managing the Android SDK
or NDK through mise, and any version *upgrade* — the pins above capture what
each repo builds with today, except `azula-site`, whose node 22 major is
preserved at its current patch.

## Capabilities

### New Capabilities

- `toolchain`: how the repos declare and resolve build toolchains — the
  per-repo manifest, exact-version pinning, the local/CI single-source rule,
  and what is deliberately left outside mise's control.

### Modified Capabilities

- `iroh-kmp`: its "Build and publish toolchain requirements" requirement drops
  the manual `JAVA_HOME` step from the publish scenario, since the repo's
  `mise.toml` now selects JDK 17 on entry. The JDK 17 / NDK r28+ / Rust-targets
  requirement itself is unchanged.

## Impact

- **All six repos** gain a `mise.toml` (`azula-openclaw`'s arrives with its
  scaffold in `openclaw-channel-plugin`, which should adopt this convention
  rather than hand-rolling an `engines` field).
- **Five workflow files** change their toolchain setup steps:
  `azula-app/publish.yml`, `azula-site/ci.yml`, `iroh-kmp/ci.yml`,
  `iroh-kmp/publish.yml`, and `azula-cli/release.yml`. `azula-app/release.yml`
  only cuts tags and needs no toolchain.
- **`azula-docs`:** new `specs/toolchain/`, a delta on `specs/iroh-kmp/`, and
  edits to `project.md`'s build/verify section and conventions.
- **No source-code change in any repo**, and nothing user-observable in the
  shipped app — no `CHANGELOG.md` entry.
- **Developer-facing:** a fresh clone needs `mise` installed and `mise trust`
  run once per repo. The release-critical workflows (`publish.yml` for both the
  app and the SDK) are touched, so they need a dry-run before the next real
  release depends on them.
