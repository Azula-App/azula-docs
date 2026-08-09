## Context

The release pipeline (`specs/release/`) is three explicit acts: **cut**
(`release.yml` bumps the newest `v*` tag and pushes it), **validate**
(`publish.yml` dispatch, `dry_run: true`), **ship** (`publish.yml` dispatch,
`dry_run: false` + a track). Two properties of it shape everything below:

1. **`publish.yml` checks out the tag**, not the dispatched ref, for every repo
   file (`ref: ${{ needs.version.outputs.tag }}`). The workflow *file* comes from
   the dispatched ref; everything it reads off disk comes from the tag. Release
   notes are a repo file, so they must be in the tag's tree or they do not exist
   as far as the build is concerned. (§"Two traps worth knowing" in
   `specs/release/design.md` — this is the same trap that made the committed
   `ExportOptions.plist` unreachable.)
2. **Re-running `publish.yml` on a tag reproduces the same build.** The version
   and version code are pure functions of the tag. Notes should be too.

Today neither store gets any text. The Play step passes `releaseName` and
`releaseFiles` and no notes; the iOS step is `xcrun altool --upload-app`, which
uploads a binary and has no parameter for TestFlight's "What to Test". Seven
tags have shipped this way.

The build number is not independent: `set_version.sh` stamps
`CURRENT_PROJECT_VERSION = <version code>`, so `0.0.7` is build `7` and the
identifying pair for an ASC build lookup is
(`preReleaseVersion.version = 0.0.7`, `version = 7`).

## Goals / Non-Goals

**Goals:**

- A complete, readable changelog that is the project's own record of what
  changed — not sized, shaped, or truncated by any store's constraints.
- A store text per release that is written by a human, fits the smallest store's
  limit, and ships **verbatim** — no transformation between the diff and the
  user's screen.
- Both written in one edit to one file, so keeping them in step is not a
  separate step.
- The tag is self-describing: given a tag, its notes are derivable from its own
  tree, exactly and repeatedly.
- A release cannot be cut with either tier missing, or with a store text a store
  will reject.
- Everything stays runnable outside GitHub Actions, per the porting design.

**Non-Goals:**

- Locales other than `en-US`.
- Generating either tier from commits, PR titles, or labels. The point is that a
  human writes the observable sentence at the moment they know what it is.
- A GitHub Release body, an azula.app changelog page, or an in-app "what's new"
  screen. Each is now a downstream consumer of a file that exists, and can be
  added without changing anything here.
- `azula-cli` notes. Different audience, different distribution (Homebrew /
  crates.io / npm), different cadence.

## Decisions

### Two tiers, one file

`azula-app/CHANGELOG.md`, at the repo root. Each version section carries a
verbatim store text and a full changelog:

````markdown
# Changelog

<!-- Only what a user can observe... (rule text, see below) -->

## [Unreleased]

### Store notes

```text
• Terminal sessions now reconnect on their own after your phone sleeps.
• Fixed the pairing screen freezing when you scan a second code.
```

### Added

- Terminal sessions reconnect automatically when the app returns from the
  background, including after the phone slept mid-session. Previously the
  session was dropped and had to be started again from the host.

### Fixed

- The QR pairing screen no longer freezes when a second code is scanned before
  the first has finished.

## [0.0.7] - 2026-07-26

…
````

Recognized: a level-2 heading of exactly `## [Unreleased]` or `## [X.Y.Z] -
YYYY-MM-DD`; inside it, `### Store notes` followed by one fenced block, and any
of the six Keep a Changelog subsections (`Added`, `Changed`, `Deprecated`,
`Removed`, `Fixed`, `Security`) holding `- ` entries. A section runs to the next
`## ` or EOF. Any other `### ` heading is an error — it is almost always a typo,
and silently ignoring it would drop entries.

**Why one file rather than `CHANGELOG.md` + `release-notes/<version>.txt`.**
The two tiers have to move together or they rot apart, and the cheapest way to
guarantee that is to make them one edit and one diff hunk. A reviewer looking at
the change sees the detailed entry and the one-line summary side by side and can
tell whether the summary still covers it. Separate files make "update the store
notes too" a second action, which is the action people skip. The cost is a fence
inside a Markdown file, which is a small price.

**Why the store block comes first in the section.** It is the summary, so it is
what you re-read when adding an entry — add the detail below, check the summary
above still covers it — and after promotion the released section leads with the
text that actually shipped.

### The store block is copied verbatim

The fence body goes to the stores byte for byte: no `- ` → `• ` rewriting, no
Markdown stripping, no wrapping, no truncation. The author types the bullet
character they want and sees exactly what a user will read.

This is the whole reason the block is worth having as a separate tier. An earlier
shape of this design had one flat list rendered into store text by a transform,
and the transform is where surprises live — a backtick that survives, a link that
renders as `[text](url)`, a line that wraps badly at 500 characters. A fence
removes that class of bug by removing the transform.

*Alternative — send Apple the full changelog section (it allows 4000 characters)
and Play only the summary.* Rejected: two different texts for one release is a
worse property than a tight budget on one. If someone reports what the App Store
told them, it should be what Play told someone else. The long form has a home
now — it is the changelog, and it is in the repo.

### The rule: only what a user can observe

Stated in the file's own header comment — where it is read at the moment of
writing, not in a doc nobody opens — and normatively in `specs/release-notes/`.
An entry earns its place if **a user could notice its absence**. That excludes
dependency bumps, refactors, DI rewiring, module splits, test and CI work, and
spec/doc changes, and it includes anything that changes what the app does, shows,
accepts, or how fast it does it. It applies to both tiers: the changelog has room
for detail, not for internals.

This is an editorial rule, so it is enforced editorially. The lint carries a
**warning-only** heuristic for the highest-signal giveaways (a line starting
`Bump`/`Bumped`/`Upgrade`/`Upgraded`/`Refactor`/`Refactored`, or containing
`dependenc`) and never fails on them. Alternatives considered: failing the build
on the heuristic — rejected, because "Fixed a crash when upgrading from 0.0.6" is
a legitimate entry and a rule that cries wolf gets worked around; and no
heuristic at all — rejected, because the cheap half of the rule is free to catch.

### Limits apply to the store block only

Play caps release notes at 500 characters per locale; TestFlight "What to Test"
and App Store "What's New" cap at 4000 each. One text satisfies the smallest, so
**500 is the limit and it is checked on the fence body alone**. The changelog
underneath is unbounded, which is the point of splitting them: the pressure that
would otherwise deform the record now lands on a summary written to be short.

The guard counts **bytes** (`wc -c`), not characters. Bytes ≥ characters always,
so a byte guard can only ever reject text that would have fit — never admit text
that would not. That is the right direction for a guard, and it avoids depending
on a UTF-8 locale being present on both a macOS and an Ubuntu runner, which is
not something to bet a release on. The cost is that punctuated text hits the
guard slightly early — each `•` is 3 bytes, so eight bullets spend 8 bytes of
headroom over an ASCII `-`.

### Promotion happens at cut time, and `release.yml` commits

`release.yml` gains three steps before it tags:

1. **validate** — `[Unreleased]` has a non-empty store block within the limit,
   and at least one changelog entry under a recognized subsection;
2. **promote** — rewrite `## [Unreleased]` to `## [X.Y.Z] - <UTC date>` and
   re-open an empty `## [Unreleased]` above it, pre-seeded with an empty `###
   Store notes` fence so the next author sees the shape;
3. **commit** `chore(release): X.Y.Z` and push it to `main`.

Then it tags **that commit** — `git tag -a "$NEW_TAG" HEAD`, not `$GITHUB_SHA` as
today, since `$GITHUB_SHA` now predates the promotion.

This is what buys property (2) from Context: the notes for `v0.0.8` live in
`v0.0.8`'s tree forever, so a re-run of `publish.yml` a month later publishes
byte-identical text, the same way it produces a byte-identical version code.

*Alternative — `publish.yml` reads `[Unreleased]` from the tag.* Rejected:
`[Unreleased]` at tag time is whatever `main` happened to hold, so two builds of
the same tag could ship different notes, and the tag would stop being
self-describing.

*Alternative — a human promotes the heading in a PR before dispatching, CI stays
read-only.* Rejected (and put to the user as an explicit choice): it adds a
manual step whose omission is only discovered at cut time anyway, and the
"CI never writes to `main`" property it preserves is already partly spent —
`release.yml` pushes a tag to the repo today.

### The cut fails rather than shipping empty or oversized notes

An empty or missing store block, no changelog entries, a malformed section, or a
store block over the limit fails `release.yml` *before* the tag is created.
Failing at cut is the whole value: no bad tag exists, nothing was uploaded, and
the fix is an ordinary commit followed by a re-dispatch. The same checks run
again in `publish.yml` as a cheap defence — a tag could have been pushed by hand.

Requiring **both** tiers is what catches the realistic drift: someone adds a
changelog entry and forgets the summary, or writes a summary and no record. What
it cannot catch is partial drift — a fourth entry added while the summary still
describes three. That is unenforceable by machine and is what review is for; the
co-location above is the mitigation.

The corollary is that **a release with no user-observable change cannot be cut**
without saying so. That is intended; if a version genuinely carries nothing
observable, the honest store note ("Stability and performance improvements.") is
one line, and writing it is a deliberate act rather than a default.

### Android: `whatsNewDirectory` on the existing action

`r0adkll/upload-google-play` takes `whatsNewDirectory`, a directory of files
named `whatsnew-<locale>`. The Android job writes the fence body to
`whatsnew/whatsnew-en-US` and passes the directory. Notes travel with the same
API call that uploads the bundle, so on Android "the binary shipped but the notes
didn't" is not a reachable state.

### iOS: the App Store Connect API, two different fields

`altool` cannot set either field, so this is a separate step after
`--upload-app`, gated identically (`workflow_dispatch && !dry_run`):

1. **App id**: `GET /v1/apps?filter[bundleId]=app.azula`.
2. **The build**: `GET /v1/builds?filter[app]=<id>&filter[preReleaseVersion.version]=<X.Y.Z>&filter[version]=<version code>`.
   The record appears a minute or two after upload, before processing finishes;
   poll every 30s for up to 20 minutes.
3. **TestFlight "What to Test"**: `GET /v1/builds/<id>/betaBuildLocalizations`
   → `PATCH /v1/betaBuildLocalizations/<id>` if an `en-US` one exists, else
   `POST /v1/betaBuildLocalizations` with the build relationship. Idempotent, so
   a re-run overwrites rather than duplicating.
4. **App Store "What's New"**: `GET /v1/apps/<id>/appStoreVersions?filter[versionString]=<X.Y.Z>`;
   if one exists in an editable state, `PATCH` its `en-US`
   `appStoreVersionLocalizations.whatsNew`. If there is none — the situation
   today, since iOS ships only to TestFlight — log that it was skipped and
   succeed. Apple also rejects `whatsNew` on a first App Store version, which
   this skip covers for free.

Only step 3 is load-bearing today; step 4 exists so the first App Store
submission is a configuration change, not a code change.

### Python for the ASC client, bash for everything else

`specs/release/design.md` keeps release *decisions* in portable bash. The ASC
step is not a decision — it is transport for a text `release_notes.sh` already
produced — and it needs an ES256 JWT assertion, which is the one thing `openssl`
does badly: it emits a DER-encoded signature that has to be unpacked into raw
`R||S` before it is a valid JOSE signature. That conversion in bash is ~20 lines
of `asn1parse` and `xxd` that nobody will want to debug during a release.

`python3` is present on every GitHub runner and every dev machine that would run
this by hand, and the script's only non-stdlib need (`pyjwt[crypto]`) is one
`pip install` in the job. *Alternative — fastlane `pilot`/`deliver`:* rejected,
a Ruby toolchain and a `Fastfile` to own for two HTTP calls. *Alternative — bash
+ openssl:* rejected as above.

The script takes `--tag`, `--notes-file`, and the ASC credentials from the
environment, and touches nothing else — so the recovery path for a failed notes
step is to run it locally against the tag, with no build artifacts and no
re-upload.

### Pre-changelog tags stay buildable

`v0.0.1` … `v0.0.7` have no `CHANGELOG.md` in their trees. `publish.yml`
distinguishes the two failure shapes:

- **file absent** → skip the notes, warn in the job summary, ship the binary.
  This is a pre-changelog tag and re-publishing one must keep working.
- **file present, section or store block for this version missing or empty** →
  fail. That is a real inconsistency (someone hand-tagged, or the promotion did
  not run), and guessing is worse than stopping.

### Dry runs print the notes

Both jobs extract and validate the store block on every run, including dry runs,
and write it into `$GITHUB_STEP_SUMMARY`. The validate act therefore shows the
exact text both stores will get, which is when it is still cheap to fix.

## Risks / Trade-offs

- **The two tiers can drift.** Nothing can verify that a summary still describes
  the entries beneath it. → Co-location makes them one diff hunk, and the cut
  fails if either is missing outright; partial drift is a review concern. This is
  the cost of having a summary at all, and it is worth paying for text that
  ships verbatim.
- **`release.yml` now pushes a commit to `main`.** If `main` ever gains branch
  protection requiring reviews or status checks, the push fails and the release
  cannot be cut. → The workflow needs an explicit bypass (a ruleset exemption for
  the Actions app) or the promotion moves into a PR. Worth deciding *before*
  protecting the branch, not after.
- **`main` advancing mid-run.** The promotion commit is built on the ref the job
  checked out; a concurrent push makes `git push origin HEAD:main` a
  non-fast-forward. → Let it fail (no rebase, no force): `concurrency: release`
  already serializes releases, the window is seconds, and a failed cut is
  harmless — nothing was tagged. Re-dispatch.
- **iOS notes can fail after the binary is on TestFlight.** ASC ingestion is
  asynchronous, so the poll can time out on a slow day. → The step fails loudly
  rather than passing quietly, and `publish_ios_notes.py` is standalone and
  idempotent: re-run it against the tag once the build appears. Nothing is
  re-uploaded, and a duplicate build number is never risked. (Android has no
  equivalent exposure — its notes ride the upload call.)
- **500 bytes is still tight**, and the cut fails at exactly the wrong moment
  when it is exceeded. → Much less painful now: the detail belongs in the
  changelog and only the summary is squeezed, so the fix is cutting a sentence
  from a text that was always meant to be short. The failure message reports the
  measured size and the limit.
- **The observable-only rule is unenforceable by machine.** → Accepted. The
  warning heuristic catches the obvious half; the rest is review.

## Migration Plan

1. Land `CHANGELOG.md` seeded with an empty `[Unreleased]` and a retrospective
   `[0.0.7] - 2026-07-26` section — both tiers — describing what is already live,
   so the first published notes do not imply the app began at 0.0.8.
2. Land the scripts and the two workflow changes together — `publish.yml`'s
   extraction tolerates a tag without the file (above), so ordering against
   in-flight tags does not matter.
3. First exercise on the next cut: dispatch `release.yml`, confirm the promotion
   commit and that `v0.0.8` contains its own section; dispatch `publish.yml` with
   `dry_run: true` and read the store text off the job summary; then ship.
4. **Rollback**: drop `whatsNewDirectory` from the Play step and the iOS notes
   step; the pipeline is byte-for-byte what it is today. The `CHANGELOG.md` and
   the promotion commit are inert on their own.

## Open Questions

- Does `main` get branch protection? It changes the promotion mechanism (see
  Risks), and the answer is not this change's to make.
- Should the changelog also feed a GitHub Release body and an azula.app page?
  Both are cheap once the file exists; out of scope here.
- Does `azula-cli` want the same file? Its release notes reach users through
  Homebrew/crates.io/npm and a `--version` string, which is a different design.
