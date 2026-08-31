# Moving to OpenClaw 2026.8.1

## Context

See [proposal.md](proposal.md). The facts that shape this, all established by
running against the real thing rather than reading release notes:

- **There is no 2.0.** 249 published versions, all `2026.x.y`, no `2.x`.
  `latest` 2026.8.1, `beta` 2026.9.1-beta.1.
- **The plugin already passes on 2026.8.1 unmodified**: clean typecheck, 80
  unit tests green, `plugins doctor` clean, `channels list --all` still offers
  `azula`. So this is a tracking change, not a migration.
- **2026.8.1 removed a batch of `plugin-sdk` subpaths** (including the
  `./plugin-sdk` barrel itself) and added 51 new ones. Neither subpath this
  plugin imports — `channel-core`, `persistent-dedupe` — is among the removals.
- **Two new install gates**, both discovered by hitting them:
  a local-path install aborts without `--force`, and *any* install aborts
  without `--accept-capabilities`.
- **Consent is derived from declared surfaces**, from a fixed vocabulary:
  `channels`, `providers`, `tools`, `contracts`, `hooks`, `mcpServers`,
  `cliCommands`, `cliBackends`, `skills`, `dangerousConfigFlags`.

## Goals / Non-Goals

**Goals:**

- Track the current release, and be honest in the manifest about what the
  plugin registers.
- Make the documented install command one that actually completes.
- Keep the change small enough that any source edit is a signal, not noise.

**Non-Goals:**

- Chasing the beta. See D3.
- Supporting 2026.7.x alongside 2026.8.1.
- Touching `azula-cli` or the `mcp-bridge` contract — nothing on the azula side
  is implicated.

## Decisions

### D1: Pin exactly, and treat a needed source edit as a finding

The SDK is pinned to `2026.8.1` rather than a range, matching the `toolchain`
capability's exact-pin rule and for the same reason: a range means two
developers, or a developer and CI, can resolve different SDKs and disagree
about whether the plugin works.

Because the plugin already passes unmodified, the implementation's expected
diff is three files — `package.json`, `openclaw.plugin.json`, `README.md` — and
no source. If a source change turns out to be needed, that is new information
about the release and should be written down, not quietly absorbed.

This is not hypothetical: the dependency is `^2026.7.1-2` today, and that
caret already admits 2026.8.1 — the plugin was never pinned, and a fresh
install would have crossed the release that added the install gates without
anyone deciding to.

*Alternative considered.* A caret range on the SDK, so the plugin keeps working
as OpenClaw moves. Rejected: OpenClaw's versions are dates, not semver, so a
range communicates nothing about compatibility and would silently pull in the
next month's breaking changes — of which 2026.8.1 shows there are some.

### D2: Declare surfaces truthfully; do not enumerate OS-level capabilities

The consent vocabulary is about *gateway surfaces*, not operating-system
permissions. It has no term for "spawns a child process" or "reads local
files", which is what this plugin actually does to reach azula.

So the manifest declares `channels` and nothing else — which is the whole truth
in that vocabulary — and the README carries the part the vocabulary cannot
express: that granting consent to this plugin means letting it run the `azula`
binary as a child process and read the files it is asked to attach.

Overdeclaring to "cover" the child process would be worse than saying nothing:
it would ask for consent to register providers and tools the plugin never
registers, training the operator to wave through a summary that does not match
reality.

### D3: Track `latest`, not `beta`

2026.9.1-beta.1 exists and will change before it becomes `latest`. Pinning to
it would mean re-testing on every beta bump for a release nobody is running,
and shipping a plugin whose stated minimum is a version most operators cannot
install.

The cost is being a release behind when 2026.9 lands. That is the right trade
for a plugin: an operator who upgrades OpenClaw the day it ships is briefly
ahead of the plugin's tested floor, which is a documentation problem, not a
broken install.

### D4: Verify by installing, not by typechecking

A clean typecheck says the SDK's *types* still line up. It says nothing about
the manifest schema, the consent model, or the install gates — and all three of
this release's changes live exactly there.

So the acceptance check is an install into a throwaway profile
(`--profile <name>`) followed by `plugins doctor` and `channels list --all`.
That is how both new gates were found; a types-only check would have shipped a
README whose install command aborts.

## Risks / Trade-offs

- **`--force` on a local-path install waves past a trust warning.** That is
  correct for developing the plugin from a checkout and wrong as a habit for
  installing other people's plugins. → The README should show `--force` only in
  the development section, and the published install (`@azula-app/openclaw`
  from npm) should not need it.
- **A stated minimum ages.** Nothing enforces it at install time, so an
  operator on 2026.7.x gets whatever failure the SDK produces rather than a
  clear "upgrade OpenClaw". → Accepted for now; if it bites, a startup probe
  like the plugin already does for azula's tools is the fix.
- **The removed `plugin-sdk` subpaths did not affect us this time.** That is
  luck as much as design — the plugin imports two subpaths out of 300-odd. →
  The install-based check in D4 is what would catch it next time.

## Migration Plan

1. Bump the pin, run typecheck and unit tests.
2. Install into a throwaway profile with both gates, and confirm `plugins
   doctor` and `channels list --all`.
3. Update the manifest declaration and the README together — the README's claim
   about what consent covers has to match what the manifest declares.

Rollback is the previous pin; nothing persists outside the plugin package.
