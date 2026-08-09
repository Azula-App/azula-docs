## Why

azula.app's documentation is essentially a pile of `azula` invocations — 21
fenced shell blocks across six doc pages and the home page — and nothing
verified any of them. No script ran them, and nothing compared them to the
CLI's actual command surface. A renamed flag would silently invalidate a
published command with nothing anywhere reporting it.

It had already rotted. The A2UI scripting snippet in `docs/cli.md` passed
`--surface "$SURFACE"` while never assigning `SURFACE`, so anyone pasting it
sent an empty surface id. That is exactly the class of defect a reader hits
first and a maintainer never sees.

The constraint that shapes the solution: most of what the docs demonstrate
cannot be executed unattended. Every networked path calls
`Endpoint::builder(presets::N0)…online()` with no timeout, so a `message send`
example without a paired phone *hangs* rather than fails. Verification
therefore has to be layered — execute what can be executed, and check the rest
statically — rather than all-or-nothing.

## What Changes

- Add **executable examples** in `azula-site/examples/`: ten scripts whose
  published region is fed to the harness on stdin and executed, so the text on
  the page *is* the text that ran rather than a copy kept in step with it.
  Each isolates `HOME`, `TMPDIR` and every `AZULA_*_DIR` into a `mktemp` tree.
- Add a **three-layer checker**, run by a new `doc-examples` skill:
  sync (published block matches the executed region), lint (`sh -n`, ShellCheck
  when installed, plus a ShellCheck-independent unassigned-variable scan), and
  surface (every documented `azula …` invocation validated against `azula
  <sub> -h`, including the command table's bracket/alternation notation).
- Add an **allowlist** (`examples/illustrative.json`) recording each
  unverifiable block by content hash with a stated reason, so the gap is
  explicit and a *new* unverified block cannot appear silently. Keying on hash
  rather than line number means editing an allowlisted block invalidates its
  entry and forces a fresh look.
- **Fix two live defects** found by the new checks: the unassigned `$SURFACE`,
  and `azula terminal list [--json]` written inside a `sh` fence where the
  bracket notation is not shell.

Verification is **on demand via the skill**, not a CI gate. Deliberate: the
value is in the examples existing and being runnable, and the parent checkout
already has every sibling repo side by side, so the skill can verify the docs
against a locally built CLI without any cross-repo plumbing.

Explicitly **not** in scope: making the networked flows executable. That would
need an offline/relay-free escape hatch in `azula-cli`'s endpoint setup — a
production change, and a separate decision.

## Capabilities

### Modified Capabilities

- `site`: adds normative requirements for the documented shell — that every
  published block is either executable and verified or explicitly recorded as
  illustrative, that every documented invocation matches the CLI's own surface,
  and that examples neither need the network nor touch the reader's real state.

## Impact

- `azula-site/examples/` — new: `_lib.sh` (isolation and assertions), ten
  example scripts, `run.sh`, `illustrative.json`.
- `azula-site/src/content/docs/{cli,install}.md` — six blocks tagged or added,
  and the two defect fixes. `cli.md`'s scripting section is split so the
  offline parts (`ui catalog`, render validation) become executable while the
  dice loop stays illustrative.
- `azula-site/package.json` — an `examples` script. Deliberately **not** folded
  into `verify`, which must stay runnable without a built CLI.
- `azula-docs/.claude/skills/doc-examples/` — new skill: `SKILL.md`,
  `scripts/check-doc-examples.mjs`, `references/offline-surface.md` (the
  evidence table for which commands bind an endpoint).
- No `azula-cli` changes. The offline-only rule exists precisely so none are
  needed.
- Tagging uses an HTML comment rather than fence meta because `stripComments`
  in `src/lib/llms.ts` removes HTML comments from the `.md` twins and
  `/llms-full.txt`, while the twin contract requires serving raw source — so
  fence meta would leak to readers.
