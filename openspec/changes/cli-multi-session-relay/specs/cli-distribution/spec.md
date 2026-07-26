# cli-distribution — delta

## ADDED Requirements

### Requirement: Tag-Driven Release Builds
The `azula-cli` repository SHALL have a release workflow triggered by `v*` tags that builds static release binaries for at least `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-musl`, and `aarch64-unknown-linux-musl`, attaching them to a GitHub Release that serves as the artifact host for the install channels. The workspace `Cargo.toml` version SHALL be the single source of truth; channel metadata (npm versions, Homebrew formula) SHALL be stamped from it by the workflow.

#### Scenario: One tag produces all artifacts
- **WHEN** a maintainer pushes a `v*` tag
- **THEN** the workflow produces all four platform binaries and attaches them to a GitHub Release without further manual steps

### Requirement: crates.io Publication
The `azula` crate (library plus the `azula` binary) SHALL be published to crates.io on release so `cargo install` works and Rust programs can depend on the library API. The demos crate SHALL NOT be published.

#### Scenario: cargo install
- **WHEN** a user runs `cargo install` for the published crate name
- **THEN** they get the released CLI version built from crates.io sources

### Requirement: npm Wrapper Package
Releases SHALL publish per-platform npm packages each carrying one binary, plus a meta package whose launcher resolves the right platform package, so `npx` can run the CLI anywhere node is available — including Claude Code web containers — and an `mcp.json` entry using `npx` is portable across machines.

#### Scenario: mcp.json via npx
- **WHEN** an MCP client spawns the CLI through `npx -y <meta-package> mcp` on a machine that has never installed azula
- **THEN** the platform binary is fetched and the stdio MCP server starts

### Requirement: Homebrew Tap
A Homebrew tap repository SHALL carry a formula installing the released binaries; the release workflow SHALL push the formula's version and checksum bump on each release.

#### Scenario: brew install
- **WHEN** a macOS user installs the formula from the tap
- **THEN** they get the latest released binary and `azula --version` matches the tag

### Requirement: Relay-Only Network Environments
The CLI SHALL function in environments without UDP connectivity by using iroh's relay-over-HTTPS fallback, and the documentation SHALL state the hosts a restrictive proxy must allowlist for a Claude Code web container to reach a device.

#### Scenario: Container with HTTPS-only egress
- **WHEN** the CLI runs where only proxied HTTPS egress is available and the iroh relay hosts are allowlisted
- **THEN** pairing and messaging to the phone still work over the relay path
