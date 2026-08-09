## Why

azula-app has shipped seven tags (`v0.0.1` … `v0.0.7`) and every one of them
reached Play and TestFlight with an empty "What's New". `publish.yml` passes
`releaseName` to the Play action and nothing else; `altool --upload-app` has no
way to set TestFlight's "What to Test" at all. The only record of what changed
in a release is the git log between two tags — commit subjects written for
maintainers, mixed with refactors and dependency bumps, and not something a
tester or a user should ever be shown.

So there are two gaps, and they are the same gap: nothing accumulates the
user-observable half of the work as it lands, and nothing carries that text to
the two store fields that display it. Writing release notes from `git log` at
ship time is the failure mode this avoids — by then the person who made the
change is gone from the context, and what's left is `refactor!: rename the node
vocabulary to endpoint`, which no user can act on.

## What Changes

Two things get written at once, in one file, both at the moment the work lands.

- **A full changelog** — `azula-app/CHANGELOG.md`, Keep a Changelog structure
  (`### Added` / `### Changed` / `### Fixed` / …) under `## [Unreleased]` and
  `## [X.Y.Z] - YYYY-MM-DD`. This is the complete record: as much detail as an
  entry deserves, readable by a user chasing "when did that change?" and by us
  reconstructing a release. It has room, because it is not what the stores get.
- **A `### Store notes` block** inside each version's section — a fenced block
  holding the exact plain text Play, TestFlight, and the App Store receive. It
  is written and re-worded by hand to fit Play's 500-character limit, and it is
  copied **verbatim**: no rendering, no Markdown stripping, no truncation. What
  you see in the diff is what a user reads in the store.

  Co-locating it is the point. Adding a changelog entry and re-wording the
  summary are one edit to one file, so "update the release notes too" is not a
  separate step anyone can forget, and reviewing the diff shows both.

- Both keep the **observable-only rule**: an entry earns its place if a user
  could notice its absence. Dependency bumps, refactors, DI rewiring, test and
  CI work, and spec/doc changes are excluded by construction. Stated in the
  file's own header, where it is read at the moment of writing.
- **`release.yml` promotes and commits before tagging.** It rewrites `##
  [Unreleased]` to `## [X.Y.Z] - <date>`, re-opens an empty `[Unreleased]` with
  an empty store-notes block, commits that to `main`, and tags *that commit*.
  This is what makes the notes reachable at publish time at all: `publish.yml`
  checks out the tag, so notes that are not in the tag's tree do not exist as far
  as the build is concerned. It also makes the cut **fail** when either tier is
  empty, or when the store block is over Play's limit — failing at cut means the
  bad tag is never created rather than discovered after a store has been fed.
- **`publish.yml` publishes the store block to both stores.** Android: it
  becomes `whatsnew/whatsnew-en-US`, handed to the existing Play action via
  `whatsNewDirectory`. iOS: after `altool --upload-app`, an App Store Connect API
  call setting TestFlight's "What to Test" (`betaBuildLocalizations.whatsNew`) on
  the build just uploaded, and the App Store's "What's New"
  (`appStoreVersionLocalizations.whatsNew`) when an editable App Store version
  exists — a no-op today, since iOS ships only to TestFlight, and the reason the
  first App Store submission needs no rework here.
- Both store writes stay behind the **existing ship gate**
  (`workflow_dispatch && !dry_run`). A dry run extracts and validates the notes
  and prints them to the job summary, so the text is reviewable before it is
  published, but sends nothing.

Explicitly **not** in scope: localizing the notes (en-US only), a GitHub Release
body, publishing the changelog on azula.app, and a changelog for `azula-cli` — a
CLI's release notes have a different audience and a different distribution path
(Homebrew/crates.io/npm), and folding them in here would settle that by accident.
The first two become nearly free once the file exists.

## Capabilities

### New Capabilities

- `release-notes`: the two tiers and what each is for, when they must be
  written, the observable-only rule, the format the tooling can parse, the
  limits each store imposes, and the requirement that both stores receive the
  store block for the version being shipped.

### Modified Capabilities

- `release`: the "Explicit three-act release flow" and "Cutting a tag never
  auto-ships" requirements both describe `release.yml` as doing nothing but
  reading, bumping, and pushing a tag. It now also promotes the changelog and
  pushes a commit to `main` — still without shipping anything, but no longer
  read-only, and now able to *refuse* to cut.

## Impact

- `azula-app/CHANGELOG.md` — new. Seeded with an empty `[Unreleased]` and a
  retrospective `[0.0.7]` section (both tiers) covering what is already live, so
  the first generated notes do not read as if the app began at 0.0.8.
- `azula-app/.github/scripts/changelog_lib.sh` — new: parse the file, extract a
  version's store block and changelog body, enforce the limits. Sourced by the
  two scripts below, and the one place the format is actually defined.
- `azula-app/.github/scripts/promote_changelog.sh` — new: `[Unreleased]` →
  `[X.Y.Z] - <date>`, called by `release.yml` before it tags.
- `azula-app/.github/scripts/release_notes.sh` — new: emit a version's store
  block to a path, called by both publish jobs.
- `azula-app/.github/scripts/publish_ios_notes.py` — new: the App Store Connect
  writes. Python rather than bash, against the convention that release decisions
  live in portable bash: ES256 JWT assertion signing is the one step openssl
  alone does badly (a DER→JOSE signature conversion), and every runner already
  has `python3`. No *decisions* live in it — it is transport for text
  `release_notes.sh` produced.
- `azula-app/.github/workflows/release.yml` — validate, promote, commit, then tag.
- `azula-app/.github/workflows/publish.yml` — extract notes in both jobs, pass
  `whatsNewDirectory` to the Play action, run the iOS notes script after the
  TestFlight upload, and echo the notes into the job summary on every run.
- `azula-docs/openspec/specs/release/` — `spec.md` and `design.md` both describe
  `release.yml` as read-only; both need the new act.
- `azula-docs/openspec/project.md` — the working agreement gains the one line that
  makes this stick: user-observable changes to azula-app update `CHANGELOG.md`
  — both tiers — in the same commit.
- No app-code, build, or dependency changes: nothing here is compiled or shipped
  inside the binary.
