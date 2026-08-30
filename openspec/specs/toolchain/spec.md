# toolchain Specification

## Purpose
Defines how azula's repos declare and resolve their build toolchains: a
per-repo manifest of exact tool versions that a developer's shell and CI both
read, so a build cannot silently differ between the two, and so a checkout
holding repos with conflicting requirements needs no manual environment
juggling.

## Requirements

### Requirement: Every Repo Declares Its Toolchain

Each repo SHALL declare, in a `mise.toml` at its root, the languages and
runtimes it builds with. The declaration SHALL cover every tool whose version
can change the build's outcome, and SHALL NOT list tools the repo does not use.

A developer entering a repo directory with mise installed SHALL get that
repo's declared toolchain without setting any environment variable by hand,
including when sibling repos in the same checkout require different versions of
the same tool.

#### Scenario: Two repos needing different JDKs

- **WHEN** a developer moves between a repo requiring JDK 17 and one requiring
  JDK 21 within the same parent checkout
- **THEN** each directory resolves to its own declared JDK, and neither
  requires `JAVA_HOME` to be set manually

#### Scenario: Fresh clone builds without environment setup

- **WHEN** a developer clones a repo, installs its declared toolchain, and runs
  that repo's documented verify command
- **THEN** the command succeeds without further environment configuration

### Requirement: Versions Are Pinned Exactly

Declared versions SHALL be exact — a full version identifying a single
released build — rather than a major-version alias, a channel name, or a
floating `latest`.

A tool whose version cannot meaningfully be pinned exactly, or that is
deliberately excluded per the requirement below, SHALL NOT be declared at all
rather than declared loosely.

#### Scenario: Patch-level drift is impossible

- **WHEN** the same repo's toolchain is resolved on two machines, or on a
  machine and a CI runner, at different times
- **THEN** both resolve to the identical tool build, with no patch-level
  difference

#### Scenario: A floating version is rejected

- **WHEN** a repo's declaration names a channel, a major-version alias, or
  `latest`
- **THEN** it does not satisfy this requirement and is treated as unpinned

### Requirement: CI Reads the Same Declaration

A repo's CI SHALL obtain its toolchain from that repo's `mise.toml` rather
than restating versions in workflow steps. A workflow SHALL NOT pin, in its own
configuration, a version of a tool the repo declares.

Consequently, changing a declared version SHALL take effect in CI without any
workflow edit.

#### Scenario: Bumping a version touches one file

- **WHEN** a repo's declared version of a tool is changed
- **THEN** CI uses the new version on the next run with no workflow file
  modified

#### Scenario: No second source of truth

- **WHEN** a workflow is inspected for the version of a declared tool
- **THEN** it names none, deferring to the repo's declaration

### Requirement: Scope of What mise Manages

The declaration SHALL cover language runtimes and compilers only. Platform SDKs
and host-provided tooling — the Android SDK and NDK, Xcode and its command-line
tools, and container runtimes used for cross-compilation — SHALL remain outside
it and continue to be provided by the host or the CI runner image.

This boundary SHALL be stated where the toolchain convention is documented, so
that a tool's absence from a declaration reads as deliberate rather than as an
oversight.

#### Scenario: Android NDK stays host-provided

- **WHEN** a repo requires the Android NDK to build
- **THEN** the NDK is not declared in `mise.toml`, and the repo's documentation
  states how it is provided instead

#### Scenario: Exclusion is documented, not implicit

- **WHEN** a developer asks why a required tool is absent from a declaration
- **THEN** the toolchain convention answers it without reading CI workflows

### Requirement: New Repos Adopt the Convention

A repo added to the checkout SHALL declare its toolchain under these rules as
part of its scaffold, rather than pinning versions in an ecosystem-specific
manifest field or only in CI.

#### Scenario: A new repo is created

- **WHEN** a repo is added to the checkout
- **THEN** it ships a `mise.toml` with exact pins, and its CI reads from it
