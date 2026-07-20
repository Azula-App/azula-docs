## Why

The invite payload / connect-gate revamp shipped (see
`openspec/specs/invitations/design.md`). It deliberately kept a transition
escape hatch open for one release so old clients wouldn't be locked out:
invite-less strangers are still admitted (marked "unverified") and legacy
share-link formats still parse. That escape hatch was never meant to be
permanent — it needs to be closed the release after it shipped.

## What Changes

- Flip `allowLegacyInbound` (app) and `--allow-legacy` (CLI `serve`/
  `serve-mcp`/`mcp`) defaults from **on** to **off**, so invite-less strangers
  are dropped again instead of landing in the inbox marked "unverified".
- Remove the now-dead "unverified pending request" admission path once no old
  clients remain.
- Remove legacy link parsing: the `/s/` and `/connect/` parse branches in
  `azula-cli/src/link.rs`, `azula-app/link/.../DeepLink.kt`, and the
  `azula-site` routes.
- Add worker-side signature verification on the `/i/` invite page: it
  currently shows a "signed" badge driven only by the flag bit, without
  verifying the Ed25519 signature (it would need to parse the node id out of
  the postcard ticket in TS). App and CLI already verify; the page is
  advisory only until this lands.

## Capabilities

### New Capabilities
(none)

### Modified Capabilities
- `invitations`: the transition/compat behavior described in
  `openspec/specs/invitations/design.md` ("Transition / compat" section)
  changes — legacy inbound admission and legacy link parsing are removed, and
  the invite page gains real signature verification. See the delta spec at
  `specs/invitations/spec.md` in this change.

## Impact

- `azula-app`: `allowLegacyInbound` setting and its unverified-inbox admission
  path; `azula-app/link/.../DeepLink.kt` legacy parse branches.
- `azula-cli`: `--allow-legacy` flag on `serve`/`serve-mcp`/`mcp`;
  `azula-cli/src/link.rs` legacy parse branches.
- `azula-site`: `/s/` and `/connect/` routes; the `/i/` invite page's
  signature-verification logic (needs node-id extraction from the postcard
  ticket in TS).
- `openspec/specs/invitations/design.md` ("Transition / compat" and "Future
  work" sections should be updated once this lands — the worker-side
  verification item currently listed under "Future work" is what this change
  implements).
