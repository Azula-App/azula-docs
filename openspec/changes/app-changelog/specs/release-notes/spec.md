## ADDED Requirements

### Requirement: Every release carries a changelog and a store text

`azula-app/CHANGELOG.md` SHALL hold, for each version, two tiers: a `### Store
notes` fenced block containing the exact plain text sent to Google Play,
TestFlight, and the App Store, and a Keep a Changelog body (`### Added`, `###
Changed`, `### Deprecated`, `### Removed`, `### Fixed`, `### Security`) holding
the complete record of that version's user-observable changes.

#### Scenario: Reading a released version

- **WHEN** a released version's section is read
- **THEN** it SHALL contain both a non-empty store-notes block and at least one
  changelog entry, so neither the store text nor the detailed record can exist
  without the other

#### Scenario: An unrecognized subsection

- **WHEN** a version section contains a `### ` heading that is neither `Store
  notes` nor one of the six Keep a Changelog categories
- **THEN** the tooling SHALL fail naming that heading, because it is almost
  always a typo and ignoring it would silently drop the entries beneath it

### Requirement: User-observable changes are recorded as they land

Every change to azula-app that a user could observe SHALL update the `##
[Unreleased]` section — adding the changelog entry and revising the store notes
to still cover it — in the same commit as the change itself. Changes a user
cannot observe SHALL NOT be recorded in either tier.

#### Scenario: An observable change lands

- **WHEN** a commit changes what the app does, shows, accepts, or how fast it
  does it
- **THEN** the same commit SHALL add an entry under the appropriate `##
  [Unreleased]` subsection and SHALL leave the store-notes block describing the
  release as it now stands

#### Scenario: A non-observable change lands

- **WHEN** a commit only bumps a dependency, refactors, rewires DI, moves code
  between modules, or touches tests, CI, or specs
- **THEN** it SHALL NOT touch either tier, because a user could not notice its
  absence

### Requirement: The store text is published verbatim

The tooling SHALL send the store-notes fence body to the stores byte for byte,
without rendering, Markdown stripping, re-wrapping, or truncation.

#### Scenario: Publishing a store block

- **WHEN** the store-notes block reads `• Fixed the pairing screen freezing on a
  second scan.`
- **THEN** the text delivered to each store SHALL be exactly that, so the diff a
  reviewer approves is the text a user reads

### Requirement: The store text fits the smallest store limit

The store-notes block SHALL be within Google Play's 500-character release-note
limit, which is the smallest of the three destinations. The changelog body SHALL
NOT be size-constrained.

#### Scenario: The store text is too long

- **WHEN** the store-notes block exceeds the limit
- **THEN** the tooling SHALL fail and report the measured size and the limit,
  rather than letting the text be truncated or rejected at upload time

#### Scenario: A long changelog entry

- **WHEN** a changelog entry runs to several sentences
- **THEN** no length check SHALL apply to it, because the record is not what the
  stores receive

### Requirement: Cutting a release moves the notes into the tag

Cutting version `X.Y.Z` SHALL rewrite `## [Unreleased]` to `## [X.Y.Z] - <UTC
date>`, re-open an empty `## [Unreleased]` above it carrying an empty store-notes
block, commit that to `main`, and create the release tag on that commit — so a
tag's tree always contains the notes for that tag's version.

#### Scenario: A cut with both tiers written

- **WHEN** `release.yml` is dispatched and `## [Unreleased]` holds a store block
  and changelog entries
- **THEN** it SHALL push a commit promoting that whole section to `## [X.Y.Z] -
  <date>` and SHALL tag that commit, not the commit it checked out

#### Scenario: The tag is self-describing

- **WHEN** tag `vX.Y.Z` is checked out
- **THEN** its `CHANGELOG.md` SHALL contain a `## [X.Y.Z]` section holding
  exactly the store text and changelog for that release

### Requirement: A release with an incomplete section cannot be cut

`release.yml` SHALL fail before creating or pushing any tag when `##
[Unreleased]` has an empty or missing store-notes block, has no changelog
entries, is malformed, or has a store block over the limit.

#### Scenario: Only one tier was written

- **WHEN** a cut is dispatched with changelog entries but an empty store-notes
  block, or with a store text but no changelog entries
- **THEN** the workflow SHALL fail and SHALL NOT create a tag, so the two tiers
  cannot silently fall out of step at the moment they are frozen

#### Scenario: Nothing was written

- **WHEN** a cut is dispatched with an empty `## [Unreleased]` section
- **THEN** the workflow SHALL fail and SHALL NOT create a tag, so no tag exists
  that cannot be given release notes

### Requirement: Both stores receive the store text for the version being shipped

A non-dry release of `vX.Y.Z` SHALL publish that tag's `## [X.Y.Z]` store-notes
block to Google Play's release notes and to TestFlight's "What to Test" for the
uploaded build, and to the App Store's "What's New" when an editable App Store
version for `X.Y.Z` exists.

#### Scenario: Publishing to Google Play

- **WHEN** the Android job uploads the AAB on a non-dry dispatch
- **THEN** it SHALL pass the store text as the `en-US` release notes in the same
  Play upload call, so a shipped bundle and its notes cannot diverge

#### Scenario: Publishing to TestFlight

- **WHEN** the iOS job has uploaded the IPA on a non-dry dispatch
- **THEN** it SHALL set `whatsNew` on the `en-US` beta build localization of the
  build identified by that version and build number, creating the localization if
  absent and updating it if present

#### Scenario: No editable App Store version exists

- **WHEN** no App Store version for `X.Y.Z` exists, or the one that exists is not
  in an editable state
- **THEN** the job SHALL record that the App Store field was skipped and SHALL
  succeed, because iOS ships only to TestFlight today

### Requirement: Dry runs show the store text and publish nothing

A dry run SHALL extract, validate, and display the exact text every store would
receive, and SHALL NOT send it anywhere.

#### Scenario: Validating a tag

- **WHEN** `publish.yml` is dispatched with `dry_run: true`
- **THEN** both jobs SHALL write the store text into the workflow job summary
  and SHALL NOT call Google Play or the App Store Connect API

### Requirement: Tags predating the changelog stay publishable

`publish.yml` SHALL distinguish a tag with no `CHANGELOG.md` from a tag whose
`CHANGELOG.md` lacks a usable section for the version being built.

#### Scenario: A pre-changelog tag is rebuilt

- **WHEN** a tag whose tree contains no `CHANGELOG.md` is published
- **THEN** the run SHALL skip the release notes, warn in the job summary, and
  still ship the binaries

#### Scenario: The section is missing from a tag that has the file

- **WHEN** a tag's `CHANGELOG.md` exists but has no `## [X.Y.Z]` section for the
  version being built, or that section's store-notes block is empty
- **THEN** the run SHALL fail, because the notes were expected and guessing at
  them is worse than stopping

### Requirement: Re-publishing a tag reproduces the same store text

The text published for a tag SHALL be a pure function of that tag, exactly as
the version and Android version code already are.

#### Scenario: Publishing the same tag twice

- **WHEN** `publish.yml` is dispatched a second time against a tag already built
- **THEN** the store text SHALL be byte-identical to the first run's, regardless
  of what `main` holds at the time
