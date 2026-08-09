## 1. Harness

- [x] 1.1 `azula-site/examples/_lib.sh`: `example_workspace` redirecting `HOME`,
      `TMPDIR` and every `AZULA_*_DIR` into a `mktemp` tree removed on exit,
      with `AZULA_REGISTRY_DIR` deliberately left unset; `example_git_root`;
      `run_doc_region` reading the published region from a quoted heredoc on
      stdin; assertion helpers.
- [x] 1.2 `run.sh`: binary discovery (`AZULA_BIN`, then sibling
      `azula-cli/target/{release,debug}`, then `PATH`), per-example pass/fail
      reporting, non-zero exit on any failure.
- [x] 1.3 Verify isolation: `~/.azula` byte-identical after a full run, no
      leftover workspaces.

## 2. Examples

- [x] 2.1 Six published: `status-fresh`, `ui-catalog`, `ui-render-validation`,
      `run-passthrough`, `pair-and-list`, `registry-precedence`.
- [x] 2.2 Four unpublished, each declaring `# unpublished: <reason>`:
      `devices-empty`, `terminal-list-empty`, `run-exit-code`, `qr-legacy-link`.
- [x] 2.3 Each carries a comment citing the source line proving it binds nothing.

## 3. Checker

- [x] 3.1 Sync layer: tagged blocks byte-match the executed region; orphan
      examples must be tagged or declare themselves unpublished.
- [x] 3.2 Allowlist: hash-keyed entries, failure text printing the hash to
      record, and stale-entry detection.
- [x] 3.3 Lint layer: `sh -n`, ShellCheck when installed (degrading with a
      note when not), and an independent unassigned-variable scan.
- [x] 3.4 Surface layer: recursive `-h` walk building the subcommand/flag/value
      tree; invocation extraction from fenced blocks, inline spans and table
      rows; bracket, alternation and trailing-comment handling.
- [x] 3.5 Acceptance — the unassigned-variable scan catches `$SURFACE` **before**
      the fix, without ShellCheck installed.
- [x] 3.6 Acceptance — sync fails on a one-character edit; surface fails on an
      unknown flag and on a bad flag value; allowlist fails on a new untagged
      block.

## 4. Documentation

- [x] 4.1 Tag `docs/install.md`'s `azula status` block.
- [x] 4.2 Split `docs/cli.md`'s scripting section so `ui catalog` and render
      validation become executable; keep the dice loop illustrative.
- [x] 4.3 Fix the unassigned `$SURFACE` — render under `--surface dice` and
      update at the same id.
- [x] 4.4 Fix `azula terminal list [--json]` inside a `sh` fence.
- [x] 4.5 Add executable blocks for `--handoff never`, `pair`, and registry
      precedence.
- [x] 4.6 Populate `illustrative.json` with a real reason per unverifiable block.
- [x] 4.7 Confirm `npm run verify` still passes and the tags reach neither the
      `.md` twins nor `/llms-full.txt`.

## 5. Skill

- [x] 5.1 `SKILL.md`: how to run it, how to read each failure, how to add an
      example, the offline rule and its rationale, prerequisites, the sandbox
      PTY caveat.
- [x] 5.2 `references/offline-surface.md`: per-command evidence for what binds
      an endpoint, the isolation variables and their traps, output determinism.
- [x] 5.3 `scripts/check-doc-examples.mjs`.
- [x] 5.4 Confirm the skill registers and that both commands in `SKILL.md` work
      verbatim from the parent checkout, including default site resolution.
      Trigger-phrase behaviour in a genuinely fresh session is still unverified
      — worth a spot check the next time someone asks "did I break the docs?".
