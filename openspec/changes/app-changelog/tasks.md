## 1. The changelog file

- [x] 1.1 Create `azula-app/CHANGELOG.md` with a header comment stating the
  observable-only rule and the two-tier format, an empty `## [Unreleased]`
  carrying an empty `### Store notes` fence, and a retrospective `## [0.0.7] -
  2026-07-26` section with both tiers (derive it from the git log between
  `v0.0.6` and `v0.0.7`, keeping only what a user could notice)
- [x] 1.2 Add the one-line convention to `azula-docs/openspec/project.md`
  ("Conventions"): a user-observable azula-app change updates both tiers of
  `CHANGELOG.md` under `[Unreleased]` in the same commit

## 2. The changelog library (the format lives here)

- [x] 2.1 Add `azula-app/.github/scripts/changelog_lib.sh` — sourced, not
  executed, alongside `version_lib.sh`
- [x] 2.2 `changelog_section <version|Unreleased>` — emit a section's raw body
  and reject any `### ` heading that is neither `Store notes` nor one of the six
  Keep a Changelog categories, naming the offending line; distinguish "file
  absent", "section absent", and "section empty" with distinct exit codes so
  callers can act on each
- [x] 2.3 `changelog_store_notes <version|Unreleased>` — emit the fence body
  under `### Store notes` **verbatim**, with no rewriting of any kind; fail
  distinctly when the block is missing or empty
- [x] 2.4 `changelog_entries <version|Unreleased>` — emit the `- ` entries from
  the Keep a Changelog subsections, used only to assert the tier is non-empty and
  to feed the heuristic below
- [x] 2.5 `changelog_check_limit` — `wc -c` on the store block against the
  500-byte Play limit, reporting measured size and limit on failure; applied to
  the store block only, never to the changelog body
- [x] 2.6 `changelog_warn_non_observable` — warning-only heuristic over both
  tiers for lines starting `Bump`/`Bumped`/`Upgrade`/`Upgraded`/`Refactor`/
  `Refactored` or containing `dependenc`; never changes the exit status

## 3. Cut-time promotion

- [x] 3.1 Add `azula-app/.github/scripts/promote_changelog.sh` — validate
  `[Unreleased]` (store block present, non-empty, within the limit; at least one
  changelog entry; no unrecognized headings), rewrite its heading to `##
  [$NEW_VERSION] - <UTC date>`, and re-open an empty `## [Unreleased]` above it
  pre-seeded with an empty `### Store notes` fence
- [x] 3.2 Wire it into `release.yml` after the version step and before tagging:
  run the script, `git commit -m "chore(release): $NEW_VERSION"`, `git push origin
  HEAD:main`, then `git tag -a "$NEW_TAG" -m "Release $NEW_TAG" HEAD`
- [x] 3.3 Change the tag target from `$GITHUB_SHA` to `HEAD` so the tag points at
  the promotion commit, and confirm no other step still assumes `$GITHUB_SHA` is
  the released commit (the Summary step prints it)
- [x] 3.4 Add the promoted store text to `$GITHUB_STEP_SUMMARY` in `release.yml`'s
  Summary step

## 4. Notes extraction in publish

- [x] 4.1 Add `azula-app/.github/scripts/release_notes.sh` — `RELEASE_VERSION` +
  an output path; skip-with-warning when `CHANGELOG.md` is absent from the tag's
  tree, fail when the file exists but the section or its store block is missing
  or empty, and write the verbatim store block otherwise
- [x] 4.2 Call it in `publish.yml`'s Android job, writing
  `whatsnew/whatsnew-en-US`, and echo the text into `$GITHUB_STEP_SUMMARY` on
  every run including dry runs
- [x] 4.3 Pass `whatsNewDirectory: whatsnew` to the `r0adkll/upload-google-play`
  step (already gated to `workflow_dispatch && !dry_run`)
- [x] 4.4 Call it in `publish.yml`'s iOS job too, with the same summary echo, so
  a dry run shows both platforms' text

## 5. App Store Connect notes

- [x] 5.1 Add `azula-app/.github/scripts/publish_ios_notes.py` — ES256 JWT from
  `ASC_KEY_ID` / `ASC_ISSUER_ID` / the `.p8` at
  `~/.appstoreconnect/private_keys/AuthKey_<KEYID>.p8`, `--tag` and
  `--notes-file` arguments, no reads of any other repo file
- [x] 5.2 Resolve the app by `filter[bundleId]=app.azula`, then the build by
  `filter[preReleaseVersion.version]=<X.Y.Z>` + `filter[version]=<version code>`,
  polling every 30s up to 20 minutes for ASC to ingest it
- [x] 5.3 Set TestFlight "What to Test": PATCH the existing `en-US`
  `betaBuildLocalizations` record if there is one, else POST a new one against
  the build
- [x] 5.4 Set App Store "What's New" when an `appStoreVersions` record for
  `X.Y.Z` exists in an editable state; otherwise log the skip and exit 0
- [x] 5.5 Add the step to `publish.yml` after "Upload to TestFlight", gated
  `github.event_name == 'workflow_dispatch' && !inputs.dry_run`, with
  `pip install 'pyjwt[crypto]'` in the same step
- [x] 5.6 On failure, print the recovery instruction (re-run the script locally
  against the tag; nothing is re-uploaded) into the step output

## 6. Verify

- [x] 6.1 Unit-test `changelog_lib.sh` against fixtures in a scratch dir: both
  tiers present; store block missing; store block empty; store block over the
  byte limit; no changelog entries; an unrecognized `### ` heading; a missing
  section; a missing file — asserting the distinct exit codes
- [x] 6.2 Assert the store block round-trips **byte-identically** through
  extraction, including a multi-byte bullet, a trailing blank line, and a line
  containing backticks and brackets that must NOT be treated as Markdown
- [x] 6.3 Run `promote_changelog.sh` on a copy of the real `CHANGELOG.md` and
  diff the result; confirm the fresh `[Unreleased]` carries an empty store-notes
  fence and the date is UTC
- [x] 6.4 Run `release_notes.sh` against a checkout of `v0.0.7` and confirm it
  takes the skip-with-warning path (no `CHANGELOG.md` in that tree)
- [ ] 6.5 Dry-run `publish.yml` against the current newest tag and confirm both
  job summaries show the store text and that no store call was made
- [ ] 6.6 Cut `v0.0.8`, confirm the promotion commit landed on `main`, the tag
  points at it, and the tag's tree carries its own `## [0.0.8]` section with both
  tiers

## 7. Update the specs

- [x] 7.1 Update `azula-docs/openspec/specs/release/design.md`: the cut act now
  validates, promotes, commits, and tags that commit; note the branch-protection
  consequence
- [x] 7.2 Add the release-notes flow to `specs/release/design.md`'s "Porting to
  another CI" — `changelog_lib.sh`, `promote_changelog.sh`, and
  `release_notes.sh` move as-is; `publish_ios_notes.py` needs only `python3` and
  the ASC credentials already listed there
- [ ] 7.3 Run `openspec validate --all` and `/opsx:archive` the change
