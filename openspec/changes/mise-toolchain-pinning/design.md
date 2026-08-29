# Pinning the toolchain with mise

## Context

See [proposal.md](proposal.md) for motivation. The constraints that shape the
approach:

- **The parent checkout is not a git repo**, and sessions run from it rather
  than from a repo root. Anything placed at the parent level is unversioned and
  would have to be recreated by hand on a fresh clone — the same reason the
  shared skills and the `openspec` pointer are relative symlinks into
  `azula-docs`. So the toolchain declarations have to live *inside* each repo,
  one per repo, not as a single checkout-wide file.
- **Two JDKs are genuinely required at once.** `azula-app` builds on JDK 21
  (`publish.yml`), `iroh-kmp` on JDK 17 (AGP 8.7). This is not drift to be
  reconciled; it is a real constraint that a per-directory manager handles and
  a global one cannot.
- **CI runners already provide things mise should not own.** The Android NDK,
  Xcode and its signing machinery, and Docker for `cross`-based musl builds are
  runner-image concerns. `cli-distribution`'s design specifically chose `cross`
  over `cargo-zigbuild` to avoid tracking a Zig version, so there is no Zig to
  pin either.
- **Release workflows are in scope and are the risky part.** `azula-app`'s and
  `iroh-kmp`'s `publish.yml` both ship artifacts; a toolchain change there is
  not verifiable by a green CI run on an unrelated PR.

## Goals / Non-Goals

**Goals:**

- One declaration per repo that a shell and a runner both read.
- Exact reproducibility: no patch-level difference between local and CI.
- Delete the manual `JAVA_HOME` instruction rather than restate it.

**Non-Goals:**

- Replacing build commands with mise tasks. `./kotlin check`, `cargo build` and
  `npm run typecheck` stay as they are; this change is about *what versions*
  those commands run under, not how they are invoked.
- Managing platform SDKs. See D3.
- Upgrading anything. Pins capture today's versions.
- A checkout-wide config. See D1.

## Decisions

### D1: One `mise.toml` per repo, none at the parent level

mise supports hierarchical config, and a parent-level file declaring shared
defaults is superficially attractive. It is rejected because the parent
checkout is not version-controlled: a file there is invisible to every clone
and would be a seventh thing the "fresh clone needs these recreated" list has
to carry. Worse, it would reintroduce exactly the failure this change fixes —
a global default that silently applies where no local file overrides it.

Each repo therefore declares its full toolchain, with no inheritance. The
duplication (three repos naming the same node version) is the point: each repo
is independently correct when cloned alone, which is how CI checks them out.

### D2: Exact pins, with the churn accepted

`java = "temurin-21.0.12+8.0.LTS"`, not `java = "21"`. A major-version alias
resolves to whatever is newest at install time, which means two developers who
onboarded a month apart, or a runner with a warm cache versus a cold one, get
different builds — the same class of bug as today's `latest`, just rarer and
therefore harder to diagnose.

The cost is periodic bumps. That is a known, boring maintenance task suited to
an automated dependency PR, and it is preferable to a version skew that
surfaces as an unreproducible CI failure.

*Alternative considered.* Major pins locally with exact pins in CI — rejected;
it makes CI the authority again and reintroduces the two-sources-of-truth
problem in a subtler form.

### D3: mise owns runtimes; the host owns platform SDKs

The boundary is drawn at "would pinning this actually make the build
reproducible, and can mise install it reliably?"

- **In:** node, rust, java.
- **Out:** the Android SDK and NDK (large, licence-gated, and already resolved
  through `ANDROID_HOME` on both hosts and runners), Xcode and its
  command-line tools (host-provided, and the iOS build is macOS-runner-bound
  anyway), Docker for `cross`.

Making this boundary an explicit spec requirement, rather than leaving it
implicit, is what stops a future reader from concluding the NDK's absence is an
oversight and "fixing" it.

### D4: CI switches to `jdx/mise-action`, one step replacing each setup step

Each workflow's `actions/setup-node`, `actions/setup-java` and
`dtolnay/rust-toolchain` step becomes a single `jdx/mise-action` step that
installs whatever the repo declares. Workflow steps that are *not* toolchain
setup — NDK provisioning, Xcode selection, signing-key import, Docker — are
untouched.

**Action pinning.** The action is referenced by full commit SHA with its
release tag as a trailing comment — never by tag alone:

```yaml
- uses: jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c # v4.3.0
```

This matches how the checkout already pins `actions/setup-java`
(`@0f481fcb… # v5.5.0`) and `dtolnay/rust-toolchain` (`@4be7066a… # stable`).
A tag is mutable and can be repointed at new code by whoever owns the
repository, so a SHA is the only reference that actually pins; the comment is
what keeps it legible and reviewable, since a bare SHA tells a reader nothing
about how far behind it is. Both halves are required — a SHA without the
comment is unreadable, a tag without the SHA is unpinned.

The same rule applies to every action added by this change, not just
`mise-action`. Two existing references violate it —
`azula-cli/release.yml`'s `dtolnay/rust-toolchain@stable` and
`actions/setup-node@v4` — and are both replaced here, so the fix comes for
free; `project.md` gains the rule so the next one is caught in review rather
than found by grep.

**Caching.** `setup-node`'s `cache: npm` in `azula-site/ci.yml` is a dependency
cache, not a toolchain concern; it is preserved by moving it to an explicit
`actions/cache` step or by keeping mise's own cache, whichever leaves the CI
runtime unchanged. This is called out because silently losing it would look
like an unrelated slowdown later.

### D5: rustup targets become an explicit step

`dtolnay/rust-toolchain` accepts a `targets:` input, and both Rust repos use
it: `azula-cli/release.yml` passes `${{ matrix.target }}` per build job, and
`iroh-kmp` passes six Android and iOS targets at once. mise installs Rust
toolchains but does not manage rustup's target sets, so this capability does
not transfer.

The targets move to an explicit `rustup target add` step after the mise step,
taking the same values from the same places. This is more verbose than the
input it replaces, and worth doing anyway: the targets become visible in the
workflow body rather than buried in an action's inputs, and `azula-cli`'s
matrix already makes the value explicit at the call site.

*Alternative considered.* Keeping `dtolnay/rust-toolchain` for the Rust repos
and using mise only for node and java — rejected, because it leaves the Rust
version pinned in the workflow, which is precisely the second source of truth
this change removes.

### D6: `azula-docs` declares node so the documented commands work

`azula-docs` builds nothing, so it would not obviously need a toolchain. It
gets one anyway: the working agreement instructs agents and humans to run
`openspec list` / `openspec validate --all`, and `openspec` is not installed —
those commands only work today via `npx -p @fission-ai/openspec`. Declaring
node and the CLI in `mise.toml` makes the documented commands run as written,
which is the difference between an instruction and a description.

### D7: Sequencing against `openclaw-channel-plugin`

`openclaw-channel-plugin`'s scaffold task currently specifies Node engines in
`package.json`. Whichever change lands second adopts the other's outcome: if
this lands first, that scaffold ships a `mise.toml` instead; if it lands
second, `azula-openclaw` is folded in here as a sixth repo. The two changes do
not conflict, they only need one of them to update the other's task.

## Risks / Trade-offs

- **Release workflows are touched and cannot be validated by ordinary CI.** →
  Verify `azula-app/publish.yml` and `iroh-kmp/publish.yml` with a `dry_run`
  dispatch before the next real release, and treat that as a required task
  rather than a follow-up.
- **Exact pins go stale and eventually stop being installable.** → Accept the
  bump cadence; prefer LTS builds, which have the longest availability.
- **`mise trust` is a new per-repo, per-machine step.** A fresh clone that
  skips it gets no toolchain and a confusing failure. → Document it in the
  build/verify section next to the install line.
- **A contributor without mise now fails differently**, and possibly less
  legibly, than one with a wrong JDK today. → The declarations are plain TOML
  naming exact versions, so a reader can install them by hand; note that in
  `project.md`.
- **Three repos duplicate the node pin**, so a node bump is three edits. →
  Deliberate, per D1; an automated dependency PR handles all three at once.

### D8: Rebuilding a tag cut before the pin

Found while preparing the dry-run, and it changes `azula-app/publish.yml`.

That workflow can rebuild an *older* tag (`tag` input, defaulting to the
latest), and it does so by checking out that tag's tree — then running
mise-action against it. A tag cut before this change contains no `mise.toml`,
so mise-action finds no config, installs nothing, and leaves the build on
whatever JDK the runner happens to ship. Silent version drift, on the one path
whose stated purpose is reproducibility.

Both jobs therefore assert `mise.toml` exists in the built tree before the mise
step, and the error names the fix: rebuild an older tag by dispatching **that
tag's own workflow** (`--ref <tag>`), which still pins its JDK the old way and
is self-consistent with the tree it builds.

`iroh-kmp` needs no such guard: its `publish.yml` triggers only on a tag push,
so workflow and tree always come from the same tag.

A consequence worth stating plainly: this change cannot be fully validated
against any existing tag, because none contains `mise.toml`. The first real
release after it lands is the first end-to-end exercise of the new path — which
is exactly why the guard fails loudly rather than quietly proceeding.

## Migration Plan

Per repo, in increasing order of blast radius, so a mistake is caught on a
cheap repo first:

1. `azula-docs` (no build) → `azula-site` (CI only, no release) →
   `azula-cli` → `iroh-kmp` → `azula-app`.
2. For each: add `mise.toml`, run the repo's documented verify command locally
   under the declared toolchain, then switch its workflows and confirm a green
   run.
3. Dry-run the two `publish.yml` workflows before closing the change.

Rollback is per repo and independent: restore that workflow's `setup-*` step
and delete its `mise.toml`. Nothing depends on another repo having migrated,
which is why the order is a convenience rather than a constraint.

## Open Questions

- Whether `mise.toml` should also declare `cross` and `cargo-zigbuild` for
  `azula-cli` through mise's cargo backend, or leave them installed by the
  release workflow as today. This affects one workflow's setup step, not the
  convention or the spec, so it can be settled while migrating that repo.
