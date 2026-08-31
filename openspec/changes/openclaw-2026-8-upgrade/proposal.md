# Track OpenClaw 2026.8.1, and drop the release before it

## Why

`@azula-app/openclaw` was built against OpenClaw **2026.7.1-2**. The current
release is **2026.8.1**, and it changed how plugins are installed.

**There is no OpenClaw 2.0.** The registry holds 249 versions, every one
date-based (`2026.x.y`); no `2.x` exists. `latest` is 2026.8.1 and `beta` is
2026.9.1-beta.1. This change tracks the current release — which is the real
version of "support the new OpenClaw" — and stops supporting 2026.7.x.

The upgrade is small, because the plugin already works on 2026.8.1 unmodified:
it typechecks, all 80 unit tests pass, `plugins doctor` reports no issues, and
`channels list --all` still offers `azula`. What changed is the *install path*,
and one thing worth doing properly rather than merely documenting.

## What Changes

- **Pin the SDK to 2026.8.1 exactly** in `azula-openclaw`, and state a minimum
  supported OpenClaw of 2026.8.1. 2026.7.x is no longer supported.

  The current dependency is `^2026.7.1-2` — a caret range, which already
  admits 2026.8.1. So the plugin is not pinned today at all: a fresh
  `npm install` silently moves it across releases, including the one that added
  the install gates below. That is the drift an exact pin exists to stop, and
  it is the same rule the `toolchain` capability applies to every other repo
  here.

- **Two new install gates, now part of the documented flow.** 2026.8.1 refuses
  a plugin install that does not clear them, and the errors are only
  discoverable by hitting them:
  - a local-path install warns that the source is outside ClawHub review and
    trust metadata, and aborts unless `--force` is passed;
  - **any** plugin install now requires capability consent, aborting with
    *"requires capability consent … rerun with `--accept-capabilities`"*.

- **Declare the plugin's surfaces honestly, so consent means something.**
  2026.8.1 derives the consent summary from a plugin's *declared surfaces* —
  `channels`, `providers`, `tools`, `contracts`, `hooks`, `mcpServers`,
  `cliCommands`, `cliBackends`, `skills`, `dangerousConfigFlags` — not from a
  free-form capability list. The manifest must declare exactly what the plugin
  registers and nothing more, so an operator granting consent can see what they
  are granting. This plugin registers one channel and nothing else; the
  manifest will say so, and the README will say what that consent covers.

- **README updated** with the real install command and what the consent
  prompt is asking. The current README's `openclaw plugins install
  @azula-app/openclaw` no longer works unattended on 2026.8.1.

- **BREAKING (for the plugin, not for azula):** dropping 2026.7.x. Nothing in
  `azula-app`, `azula-cli` or the wire protocol changes; the `mcp-bridge`
  contract is untouched.

Not in scope: targeting the 2026.9.1 beta (it will move before this ships),
and the removed `plugin-sdk` subpaths — 2026.8.1 dropped a number of them, but
neither of the two this plugin imports (`channel-core`, `persistent-dedupe`) is
among them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `openclaw-channel`: its install and consent behaviour becomes part of the
  contract — a stated minimum OpenClaw version, a manifest that declares
  exactly the surfaces the plugin registers, and an install flow whose gates
  are documented rather than discovered by failing.

## Impact

- **`azula-openclaw`:** `package.json` (SDK pin, engines note),
  `openclaw.plugin.json` (surface declaration), `README.md` (install flow and
  what consent covers). No source change is expected — the plugin already
  passes against 2026.8.1 — so any that appears is a finding, not a chore.
- **`azula-docs`:** a delta on `specs/openclaw-channel/`.
- **No change to `azula-cli` or `azula-app`.** `get_events` and `set_typing`
  are unaffected; this is entirely on the OpenClaw side of the bridge.
- **Operators on 2026.7.x** must upgrade OpenClaw before taking a new plugin
  release. That is the point of dropping it, but it is a real break and the
  README should say so.
