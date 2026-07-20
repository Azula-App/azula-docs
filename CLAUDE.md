# azula — docs repo

**The working agreement lives in [`openspec/project.md`](openspec/project.md).
Read it first** — it has the project map (all five sibling repos), build/verify
steps, the model-usage policy, and conventions.

This repo is the cross-repo home for:

- `openspec/` — the [OpenSpec](https://github.com/Fission-AI/OpenSpec) tree:
  `specs/<capability>/spec.md` (normative requirements) + `design.md` (deep
  prose), `changes/` (in-flight and planned work, including tech debt),
  `changes/archive/` (shipped changes), `project.md`, `config.yaml`.
- `.claude/skills/` — shared agent skills (surfaced to the parent checkout via
  its `.claude/skills` symlink), including the `openspec-*` workflow skills.
- `.claude/commands/opsx/` — the `/opsx:*` slash commands (`explore`,
  `propose`, `apply`, `archive`).

Start spec'd work with `/opsx:propose`, implement with `/opsx:apply`, and
archive with `/opsx:archive`. Use `openspec list` / `openspec validate --all`
to inspect state.
