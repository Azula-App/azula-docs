# CLI distribution — one tag, three install channels

`azula-cli` publishes to Homebrew, crates.io, and npm off a single `v*` git
tag, via `.github/workflows/release.yml`. The workspace `Cargo.toml`
`[package] version` is the single source of truth; every other channel's
version is stamped from it at release time, never hand-edited independently.
See `openspec/changes/cli-multi-session-relay/design.md` decision D7 for the
original rationale; this page documents the implemented pipeline.

## Where it lives

- `azula-cli/.github/workflows/release.yml` — the five-job pipeline.
- `azula-cli/dist/README.md` — scaffolding overview + the name-availability
  check recorded at implementation time.
- `azula-cli/dist/npm/{package.json,generate.mjs,bin/azula.js}` — the npm
  meta-package template and platform-package generator.
- `azula-cli/dist/homebrew/{azula.rb,README.md}` — the Homebrew formula
  template and tap-repo setup notes.
- `azula-cli/README.md`'s "Install" section — the user-facing install
  instructions for all three channels plus the Claude Code web container
  networking note (kept current with this pipeline; see
  [`project.md`](../../../project.md) for a note on the rest of that file's
  currency).

## The pipeline (`v*` tag → five jobs)

```text
push v0.2.0
  └─ version-guard        tag "0.2.0" must equal Cargo.toml's [package] version, or fail fast
       └─ build-and-release   4-target matrix -> tar.gz + .sha256 -> attached to a GitHub Release
            ├─ publish-crates     cargo publish -p azula          (if: CARGO_REGISTRY_TOKEN set)
            ├─ publish-npm        4 platform pkgs + 1 meta pkg    (if: NPM_TOKEN set)
            └─ publish-homebrew   bump homebrew-azula tap formula (if: TAP_PUSH_TOKEN set)
```

1. **`version-guard`** — greps the first `version = "..."` line out of the
   workspace root `Cargo.toml` (the one `[package]` table, since
   `[workspace]` itself declares no version — no Rust toolchain needed just
   to answer this) and compares it to `${GITHUB_REF_NAME#v}`. A mismatch
   fails the whole run immediately, before any binary is built — "bump
   Cargo.toml (and Cargo.lock) and re-tag."
2. **`build-and-release`** — a 4-target matrix, `fail-fast: false` (one
   target failing doesn't cancel the others):

   | target | runner | build |
   |---|---|---|
   | `aarch64-apple-darwin` | `macos-14` | native |
   | `x86_64-apple-darwin` | `macos-14` | native |
   | `x86_64-unknown-linux-musl` | `ubuntu-22.04` | native (`musl-tools` installed first) |
   | `aarch64-unknown-linux-musl` | `ubuntu-22.04` | **`cross`**, not native |

   Static musl targets (not glibc) so the resulting Linux binaries need no
   host libc match — the explicit motivation being containers, including the
   Claude Code web container. `aarch64-unknown-linux-musl` is cross-compiled
   with [`cross`](https://github.com/cross-rs/cross) rather than
   `cargo-zigbuild`: an x86_64 Ubuntu runner can't natively link a
   musl/aarch64 binary, `cross`'s Docker images already ship a matched
   toolchain (no separate Zig version to track), and GitHub's Ubuntu runners
   have Docker preinstalled. `cargo-zigbuild` is noted in the workflow's own
   comments as the lighter no-Docker fallback if `cross`'s Docker dependency
   ever becomes a problem. Every build is `-p azula` only — the `demos`
   workspace member (`demo-ui`/`blackjack`) is excluded, per cli-distribution
   spec's "The demos crate SHALL NOT be published." Each target's artifact is
   `azula-<version>-<target>.tar.gz` (containing just the `azula` binary,
   `chmod +x`) plus a `.sha256` file, both attached to a GitHub Release —
   marked `prerelease: true` when the tag name contains a `-` (e.g. an
   `-rc1` suffix). This Release is the **artifact host** the other two
   channels download from; it is not itself a user-facing install channel.
3. **`publish-crates`** — `cargo publish -p azula --locked` using
   `CARGO_REGISTRY_TOKEN`. Gated `if: secrets.CARGO_REGISTRY_TOKEN != ''` —
   an unconfigured channel is skipped, not a hard failure, so a repo that
   hasn't set up crates.io publishing yet still gets a clean GitHub Release
   from job 2.
4. **`publish-npm`** — downloads all four release binaries, runs
   `dist/npm/generate.mjs --version V --bin-dir bin-download --out-dir
   npm-out` to materialize five package directories (four platform packages
   + the meta package — see "npm packaging" below), then `npm publish`s the
   platform packages **first** (so the meta package's
   `optionalDependencies` resolve on npm the instant it's published right
   after). Gated on `NPM_TOKEN`.
5. **`publish-homebrew`** — checks out both `azula-cli` (for the formula
   *template*) and the separate `Azula-App/homebrew-azula` tap repo (using a
   `TAP_PUSH_TOKEN`), downloads the four `.sha256` sum files from the
   release, `sed`-substitutes `__VERSION__`/`__SHA256_*__` placeholders in
   `dist/homebrew/azula.rb` into `homebrew-azula/Formula/azula.rb`, and
   commits + pushes if the rendered formula actually changed (a no-op tag
   re-run, e.g. a workflow re-trigger, doesn't produce an empty commit).
   Gated on `TAP_PUSH_TOKEN`.

`concurrency: group: release-${{ github.ref }}, cancel-in-progress: false` —
two pushes of the same tag ref queue rather than race or cancel each other;
`permissions: contents: read` by default, with only `build-and-release`
elevating to `contents: write` (the one job that creates the GitHub Release).

## npm packaging (`dist/npm/`)

esbuild-style layout: one small binary-carrying package per platform, plus a
meta package with a tiny launcher.

- **`generate.mjs`** (release-time only, not published itself) — takes the
  four downloaded target binaries and a version, and writes:
  - `npm-out/cli-darwin-arm64/`, `cli-darwin-x64/`, `cli-linux-x64/`,
    `cli-linux-arm64/` — each `{name: "@azula-app/cli-<platform>", version,
    os, cpu}` plus the one `azula` binary for that platform, marked
    executable.
  - `npm-out/azula-cli/` — the meta package (from `dist/npm/package.json`'s
    template), whose `optionalDependencies` list all four platform packages
    pinned to the same version; npm's own platform-matching machinery
    resolves and installs only the one matching `os`/`cpu` on `npm install`.
- **`bin/azula.js`** — the meta package's launcher: a small Node script
  (`PLATFORM_PACKAGES` map from `process.platform`/`process.arch` to the
  right `@azula-app/cli-*` package name) that locates the installed platform
  package's binary and `execFileSync`s it with the process's own argv,
  forwarding stdio and exit code — this is what makes `npx -y azula-cli mcp`
  behave exactly like a native `azula mcp` invocation, including as a stdio
  MCP server (no wrapper-added stdout noise that would corrupt the JSON-RPC
  stream).

This is what makes both of these work without any prior install:

```jsonc
{"mcpServers": {"azula": {"command": "npx", "args": ["-y", "azula-cli", "mcp"]}}}
```
```sh
npx -y azula-cli --version   # fetches the right platform package, execs it
```

## Homebrew (`dist/homebrew/`)

A separate tap repository, `Azula-App/homebrew-azula`, decoupled from the
`azula-cli` repo itself (standard Homebrew convention — a tap repo's name
must start with `homebrew-`). `dist/homebrew/azula.rb` is the **template**
committed to `azula-cli` (with `__VERSION__`/`__SHA256_*__` placeholders);
the workflow renders it into the tap repo's `Formula/azula.rb` on every
release. `dist/homebrew/README.md` documents the one-time manual setup (see
below).

```sh
brew install azula-app/azula/azula
```

## Manual setup required before each channel goes live

None of jobs 3-5 are required to succeed — each is `if:`-gated on its own
secret existing, so an unconfigured channel is silently skipped rather than
failing the release. Per `dist/README.md`, lighting up all three needs, done
once by a maintainer outside this pipeline:

1. **crates.io** — an API token from <https://crates.io/settings/tokens>,
   stored as the `CARGO_REGISTRY_TOKEN` repo secret.
2. **npm** — the `azula-app` org created on npmjs.com (needed for the four
   scoped `@azula-app/cli-*` platform packages regardless of what the meta
   package itself is named), an Automation token with publish access,
   stored as `NPM_TOKEN`.
3. **Homebrew** — the `Azula-App/homebrew-azula` repo created, plus a
   repo-scoped push token stored as `TAP_PUSH_TOKEN` (full steps in
   `dist/homebrew/README.md`).

`dist/README.md` also flags that `Azula-App/azula-cli` (used throughout
`release.yml`, the npm `package.json` `repository` fields, and the Homebrew
formula's download URLs) needs confirming as the actual final repo location
before the first tag — it's simply what `git remote -v` pointed to in the
worktree this was authored in.

## Name availability (checked 2026-07-24, per `dist/README.md`)

| Registry | Name | Status |
|---|---|---|
| crates.io | `azula` | **Available** |
| crates.io | `azula-cli` (D7 fallback) | Available (not needed) |
| npm | `azula-cli` | **Available** |
| npm | `@azula-app/cli-darwin-arm64` (and the other three) | Not independently reserved until first publish; the `azula-app` npm org itself must still be created manually regardless |

Both primary D7 names are free, so no fallback is needed as of that check.
**Re-check immediately before the first tagged release** — `cargo publish`/
`npm publish` fail loudly if a name was claimed in the meantime, but the
fallback path (documented in D7 and `dist/README.md`) is a coordinated,
multi-file rename: `dist/npm/package.json`, `dist/npm/generate.mjs` (the
`SCOPE`/`META_NAME` constants and the `@azula-app/cli-*` package names),
`dist/npm/bin/azula.js` (`PLATFORM_PACKAGES`), and, for the crates.io
fallback specifically, the root `Cargo.toml`'s `[package] name` — a breaking
change for anyone who already ran `cargo install azula`, so this one is
worth confirming free *before* the first release rather than dealing with
after.

## Relay-only (no-UDP) networking — the Claude Code web container case

The Claude Code web container's egress is proxied HTTPS only, with no raw
UDP — iroh's direct QUIC hole-punching path can't establish there, so
pairing and messaging fall back to iroh's **relay-over-HTTPS** path
end-to-end. This works transparently (no azula-side code change was needed —
iroh's endpoint already falls back to its own relay infrastructure when
direct connectivity fails), but it means the container's outbound proxy
allowlist must permit the n0 relay hosts iroh dials by default. `README.md`
records the four regional hostnames (verified against the `iroh 1.0.0`
pinned in `Cargo.lock` at documentation time, sourced from
[`iroh/src/defaults.rs`](https://github.com/n0-computer/iroh/blob/main/iroh/src/defaults.rs)'s
`prod` module), reached over HTTPS/443, with an explicit caveat that n0 can
add/retire relay nodes between iroh releases — re-check that file (or
`cargo tree -p iroh` for the locked version) if the pinned iroh version ever
changes and a previously-working proxied environment stops pairing.

**Documented limitation, not a bug**: if a container's proxy blocks those
hosts outright, azula cannot reach the phone at all from that environment —
there is no user-controlled-relay fallback in this release (design.md D8's
explicit scope decision: `azula relay`, the always-on *application-level*
role documented in [`relay-design.md`](relay-design.md), is a different
thing from an iroh transport relay and doesn't help here). This constraint
is specific to relay-only egress; normal dev-machine usage with UDP egress,
and `azula relay` itself running on ordinary hardware, are unaffected.

## Tests / verification

There is no unit-test suite for the release workflow itself (it's CI-only
YAML plus a small Node generator script); verification is by inspection —
`dist/README.md`'s recorded name-availability check, and the workflow's own
`version-guard` job acting as a build-time consistency check every release
run exercises for free. `dist/npm/generate.mjs` has no `azula-cli`-internal
test harness of its own; the closest thing to a check is running it by hand
against a `bin-download/` directory shaped like `build-and-release`'s
output.
