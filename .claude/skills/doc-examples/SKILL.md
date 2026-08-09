---
name: doc-examples
description: >
  Verify that the shell examples published on azula.app still work, and add new
  ones. Runs the executable examples in azula-site/examples/ against a real
  azula binary, checks every published block still matches the script that ran,
  lints every snippet, and validates every documented `azula …` invocation
  against the CLI's own help output. Use when changing the azula CLI surface,
  when editing docs on the site, or to answer "do the docs still work?".
  Triggers: "verify the doc examples", "check the site snippets against the
  CLI", "did I break the docs", "add an example to the docs", "run the doc
  examples".
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# azula.app documentation examples

The site's docs are mostly `azula` invocations. This skill is how you find out
whether they still do what they say — the docs had a snippet referencing an
unassigned `$SURFACE` for months, and nothing caught it.

Run everything from the **parent checkout** (`~/Developer/azula` or wherever
the sibling repos live side by side).

## Run it

```bash
azula-site/examples/run.sh
```

```bash
node azula-docs/.claude/skills/doc-examples/scripts/check-doc-examples.mjs --require-binary
```

The first executes the examples; the second is the static half. Both find the
binary automatically — `azula-cli/target/{release,debug}/azula`, then `azula`
on `PATH`.

The checker defaults to the sibling `azula-site/`. When the docs live in a
worktree, point it there:

```bash
node azula-docs/.claude/skills/doc-examples/scripts/check-doc-examples.mjs \
  --site .worktrees/azula-site--<change> --require-binary
```

Override the binary with `AZULA_BIN=…` to test a published release instead of
the local build:

```bash
AZULA_BIN=$(npx -y --package @azula-app/cli -c 'command -v azula') azula-site/examples/run.sh
```

If there's no local binary, build one:

```bash
cd azula-cli && cargo build --release -p azula
```

## What each layer catches

| Layer | Catches |
|---|---|
| **Execute** (`run.sh`) | A published command that no longer does what the page claims |
| **Sync** | A doc block edited out of step with the script that runs it |
| **Lint** | A snippet that isn't valid shell, or references a variable nothing assigns |
| **Surface** | A renamed/removed subcommand, flag, or flag value anywhere in the content — including the command table |

The surface layer is the one that matters after a CLI change: it reads `azula
<sub> -h` and validates every `azula …` string in the content against it,
including inline spans and table rows. It is offline — clap binds nothing.

## Interpreting failures

- **"does not match the region examples/`<id>`.sh actually runs"** — the block
  and its script diverged. The script is the source of truth (it's what
  executed); copy its region into the doc, or change both.
- **"unknown flag / unknown subcommand / does not accept"** — the CLI moved and
  the docs didn't. Fix the page. If the CLI change was accidental, fix the CLI.
- **"references `$VAR`, which nothing in the block assigns"** — a reader
  pasting this gets an empty value. Either assign it in the block or restructure
  so it isn't needed.
- **"is neither tagged nor recorded as illustrative"** — a new `sh` block
  appeared. Make it executable (below), or add the printed entry to
  `azula-site/examples/illustrative.json` with a real reason.
- **"entry … matches no block"** — an allowlisted block was edited. Re-read it,
  then update the hash or drop the entry. This is deliberate: editing an
  unverified snippet should force a fresh look.

## Adding an example

**The offline rule: an example may only run commands that bind no iroh
endpoint.** Anything reaching `core::establish` or `bind_endpoint_with_secret`
calls `Endpoint::builder(presets::N0)…online()` with no timeout — it will hang
forever, not fail. `references/offline-surface.md` lists what is safe and cites
the source lines. When in doubt, assume a command binds.

1. Create `azula-site/examples/<id>.sh` from this shape:

   ```sh
   #!/usr/bin/env sh
   # <which page and claim this backs, and why it binds nothing>
   set -eu
   . "$(dirname "$0")/_lib.sh"
   example_workspace          # isolated HOME/TMPDIR/AZULA_*; add example_git_root for a project registry

   run_doc_region <<'EXAMPLE'
   azula something
   EXAMPLE

   assert_rc 0
   assert_out "…"
   ```

   The heredoc body is the published text — `run_doc_region` reads it from
   stdin and executes it, so the page shows exactly what ran. It must be a
   **quoted** heredoc (`<<'EXAMPLE'`): unquoted, the shell would expand `$?`
   before publishing, and marker comments around bare shell lines would execute
   inline and again in the harness.

2. Put the identical lines in a fenced `sh` block, preceded by the tag:

   ```markdown
   <!-- example: <id> -->

   ```sh
   azula something
   ```
   ```

   The HTML comment is stripped from the `.md` twins and `/llms-full.txt` by
   `stripComments` in `src/lib/llms.ts`, so readers never see it. Don't use
   fence meta — the twin serves raw source, so meta would leak.

3. An example that exists only for coverage, with no block, needs a
   `# unpublished: <reason>` comment instead of a tag.

4. Run both commands above.

### Assertion rules

- **Never golden-compare JSON.** The same binary emits alphabetical keys for
  `json!`-built maps and declaration order for derived structs. Use
  `assert_json` (a jq filter over the last output line).
- **Never golden-compare `azula run` output.** It comes through a PTY carrying
  CRLF and line-discipline bytes. `assert_out` already strips CR and matches
  substrings.
- Assert on the *claim the page makes*, not on incidental formatting.

## Prerequisites

- **`jq`** — required by the assertion helpers (`brew install jq`).
- **`shellcheck`** — optional; the lint layer adds its findings when present
  and says so when not (`brew install shellcheck`). The unassigned-variable
  scan runs either way and does not depend on it.
- **Sandbox:** `azula run` allocates a PTY via `/dev/ptmx`, which the Claude
  Code sandbox blocks — it surfaces as a misleading `spawning the wrapped
  command` error. Re-run those with the sandbox disabled; `/sandbox` manages
  the rules.

## Safety

Examples run on a real machine, so `_lib.sh` redirects `HOME`, `TMPDIR` and
every `AZULA_*_DIR` into a `mktemp` tree removed on exit — your actual
`~/.azula` identity and paired devices are never touched. `AZULA_REGISTRY_DIR`
is deliberately left unset; setting it would collapse the project and global
registries and defeat the very behaviour `registry-precedence.sh` proves. If
you add a helper that writes outside the workspace, that guarantee is gone —
re-check it with the snapshot in `references/offline-surface.md`.
