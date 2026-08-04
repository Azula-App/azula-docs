# Endpoint Rename Proposal

> **Recorded after the fact.** This change was implemented and shipped on
> 2026-08-03 without going through `propose → apply → archive` first, and is
> written up here because it altered a normative requirement
> (`iroh-kmp`'s "Backward-compatible transport surface"). The tasks are recorded
> as done because they are; the value of the record is the rationale and the
> boundary decisions, not the checklist.

## Why

iroh renamed *node* to *endpoint* across its 1.0 API — `EndpointAddr`,
`EndpointId`, `Endpoint::id`, `Endpoint::addr`, `Connection::remote_id`. The
`iroh-kmp` binding kept the pre-1.0 vocabulary and translated at the boundary:
`node_addr.rs` existed to convert between our `NodeAddr` and
`iroh::EndpointAddr`, field for field, so the wrapper was expressing iroh's
current types in iroh's old names. azula-app and azula-cli had grown the same
`node` vocabulary from the SDK.

Sal's call was explicit: while the Kotlin binding is at v0.x, being close to the
Rust crate is worth more than a stable name — "rename everything like it's still
unlaunched". That extends to the wire and storage names, which nothing deployed
depends on yet.

The upgrade to iroh 1.0.3 that preceded this (see `## Context` below) is what
surfaced how far the vocabulary had drifted.

## What Changes

- **BREAKING (`iroh-kmp` 0.1.2 → 0.2.0):** the generated Kotlin surface adopts
  iroh's names. `NodeAddr` → `EndpointAddr` (field `node_id` → `id`),
  `node_id()` → `id()`, `node_addr()` → `addr()`, `node_addr_updated()` →
  `addr_updated()`, `connect_by_node_id` → `connect_by_id`, `remote_node_id` →
  `remote_id`, `RemoteInfo.node_id` → `id`, and the three free functions
  (`endpoint_id_from_ticket`, `endpoint_addr_from_ticket`,
  `ticket_from_endpoint_addr`). `EndpointAddr` keeps its flattened
  `relay_url`/`direct_addresses` shape rather than iroh's mixed `addrs` set —
  UniFFI has no sum type that can carry `TransportAddr` across the FFI — so it
  stays a distinct type, now named after the one it converts to.
- **BREAKING (wire, azula-app + azula-cli 0.2.0):** `Contact` serializes as
  `{"endpointId": …}`; the `ContactAdd`/`ContactRemove` body is
  `{root_pk | endpoint_id, name?}`; `InvitationsStore` records use `endpointId`.
  Renamed in both repos in the same pass — a mismatch there does not fail to
  compile, it deserializes to null.
- **MODIFIED requirement:** `iroh-kmp`'s "Backward-compatible transport surface"
  became false the moment 0.2.0 shipped. Replaced with "Transport surface tracks
  the iroh crate" (see the delta spec).
- Two identity requirements renamed: "Identity Is a Root Keypair Above Device
  **Endpoint** Keys" and "Identity Is an iroh **Endpoint** Keypair", with every
  reference updated including azula-app's citation in
  `core/src/dev/azula/core/RootIdentityMigration.kt`.

## What Is Deliberately Not Renamed

The word `node` is shared with three foreign vocabularies, kept intact and
verified (all 133 Compose call sites in azula-app confirmed untouched):

- **Compose** semantics and layout trees — `onNodeWithTag`, `onNodeWithText`,
  `onAllNodes`, `fetchSemanticsNodes`, "the node's bounds", "one node per row".
- **Node.js** — the npm launcher and `npx` prose in `cli-distribution`,
  `node_modules` in the design-sync notes.
- **JSON / A2UI trees** — `a2ui/JsonPointer.kt`, the A2UI render tree, SVG
  `<text>` nodes in the store-listing skill.
- **n0 relay infrastructure** — "relay nodes" are relay servers, not endpoints.

The rename was therefore done by compound identifier (`nodeId`, `NodeKey`,
`node_id`, …) and unambiguous phrase ("node id", "node key"), never by the bare
word, with the residuals hand-classified.

## Context: the iroh 1.0.3 upgrade

Immediately prior, `iroh` went 1.0.0 → 1.0.3, which exposed a real defect. iroh
1.0.3 added `PkarrResolver::n0_dns()` to `presets::N0` on every platform (1.0.0
gated it to `cfg(wasm_browser)`). `builder_from_options` used the preset only for
the default case and hand-composed everything else from `presets::Minimal`,
re-listing the preset's address lookup services — so any caller with a custom or
disabled relay mode silently got two services instead of three, publishing over
pkarr while resolving over DNS alone. Fixed by building every configuration by
*subtracting* from `presets::N0` instead of re-listing it, so the next service n0
adds arrives without an edit.

## Impact

- Affected specs: `iroh-kmp` (modified requirement + corrected API names),
  `identity` (two requirement titles).
- Affected code: `iroh-kmp` (0.2.0, Maven Central), `azula-cli` (v0.2.0 —
  crates.io, `@azula-app/cli` on npm, GitHub Release), `azula-app` (v0.0.7 —
  Play internal + TestFlight).
- **Released artifacts on 0.1.x cannot sync with 0.2.x.** There is no version
  negotiation, and a missing JSON field deserializes to null rather than
  erroring, so the failure is silent. Accepted because nothing is deployed to
  real users yet.
