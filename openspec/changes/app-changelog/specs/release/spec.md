## MODIFIED Requirements

### Requirement: Cutting a tag never auto-ships
Pushing or bumping a version tag SHALL NOT by itself upload a build to Play or
TestFlight; shipping SHALL require an explicit manual dispatch.

#### Scenario: release.yml bumps a tag
- **WHEN** `release.yml` is run with a `major | minor | patch` choice
- **THEN** it SHALL read the newest `v*` tag, bump it, validate and promote the
  changelog's `[Unreleased]` section into a `[X.Y.Z]` section, push that
  promotion commit to `main`, and push a new tag pointing at that commit, and
  SHALL NOT trigger `publish.yml` or any store upload

#### Scenario: A tag is pushed by any actor
- **WHEN** a `v*` tag is pushed (by a human, a PAT, or a workflow)
- **THEN** the store-upload steps of `publish.yml` SHALL run only when the
  triggering event is `workflow_dispatch` AND `dry_run` is false, and a plain
  tag push SHALL at most build and validate artifacts

### Requirement: Explicit three-act release flow
The system SHALL separate cutting a release, validating it, and shipping it
into three distinct, individually-invoked acts.

#### Scenario: Validating without shipping
- **WHEN** `publish.yml` is dispatched against a tag with `dry_run: true`
- **THEN** it SHALL build, sign, and validate both platforms (Android AAB; iOS
  IPA + `altool --validate-app`) and upload each as a workflow artifact, without
  uploading to Play or TestFlight

#### Scenario: Reviewing the release notes before shipping
- **WHEN** `publish.yml` is dispatched against a tag with `dry_run: true`
- **THEN** it SHALL display the exact release-note text both stores would
  receive, so the validate act is where that text is reviewed rather than after
  a store has been fed

#### Scenario: Shipping
- **WHEN** `publish.yml` is dispatched against a tag with `dry_run: false` and a
  `track`
- **THEN** it SHALL upload the Android AAB to the given Play track and the iOS
  IPA to TestFlight, each carrying that tag's release notes
