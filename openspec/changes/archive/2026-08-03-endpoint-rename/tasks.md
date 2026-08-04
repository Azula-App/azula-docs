# Tasks — endpoint-rename

All complete; recorded after the fact (see `proposal.md`).

## 1. iroh dependency

- [x] 1.1 `iroh` 1.0.0 → 1.0.3 in `iroh-kmp/Cargo.toml` + lockfile (`iroh-base`, `iroh-dns`, `iroh-relay` follow; `vergen`/`darling`/`derive_builder` drop out of the tree)
- [x] 1.2 Fix the address-lookup drift: build every endpoint config by subtracting from `presets::N0` instead of re-listing its services, restoring `PkarrResolver::n0_dns()` on the custom/disabled-relay paths
- [x] 1.3 Cover it: `address_lookup_survives_non_default_relay_modes` (asserts the Disabled and Custom paths carry the same service count as the default) and `address_lookup_false_clears_every_service`. Mutation-checked — reintroducing the old hand-composition fails 2 vs 3

## 2. iroh-kmp surface rename (0.2.0)

- [x] 2.1 `node_addr.rs` → `endpoint_addr.rs`; `NodeAddr` → `EndpointAddr` with field `node_id` → `id`; convert to/from `iroh::EndpointAddr` at the boundary
- [x] 2.2 Methods: `node_id()` → `id()`, `node_addr()` → `addr()`, `node_addr_updated()` → `addr_updated()`, `connect_by_node_id` → `connect_by_id`, `IrohConnection::remote_node_id` → `remote_id`, `RemoteInfo.node_id` → `id`
- [x] 2.3 Free functions: `node_id_from_ticket` → `endpoint_id_from_ticket`, `node_addr_from_ticket` → `endpoint_addr_from_ticket`, `ticket_from_node_addr` → `ticket_from_endpoint_addr`; `verify_signature` parameter → `endpoint_id_hex`
- [x] 2.4 `VERSION_NAME` 0.1.2 → 0.2.0; README and Gradle comments follow
- [x] 2.5 Publish 0.2.0 to Maven Central (tag `v0.2.0`)

## 3. azula-app

- [x] 3.1 Rename azula's own vocabulary: `nodeId`/`nodeKey`/`nodeSecret`/`NodeAddr` → `endpoint*` across 57 files, excluding Compose/JSON-tree/Node.js uses
- [x] 3.2 Fix the SDK boundary by hand — the bulk rename yields `endpointId()`, but the SDK adopted iroh's `id()`
- [x] 3.3 Wire + storage: `Contact` → `{"endpointId"}`, `ContactKeyBody` → `@SerialName("endpoint_id")`, `InvitationsStore` records
- [x] 3.4 Bump the `app.azula.iroh:iroh-kmp` coordinate to 0.2.0 in `network-real/module.yaml` (×2) and `android-app/module.yaml`
- [x] 3.5 Follow the renamed OpenSpec requirement title in `core/src/dev/azula/core/RootIdentityMigration.kt`

## 4. azula-cli

- [x] 4.1 Rename `node_id`/`node_key`/`node_secret` → `endpoint_*` across 26 files; keep Node.js and "relay nodes" intact
- [x] 4.2 Wire, in lockstep with azula-app: `#[serde(rename = "endpointId")]`, eventlog body `{root_pk | endpoint_id, name?}`
- [x] 4.3 Verify both ends agree on the serialized strings by direct comparison, not by assuming the rename was symmetric
- [x] 4.4 Bump `Cargo.toml` to 0.2.0 (the release workflow's version-guard requires tag == manifest) and release `v0.2.0`

## 5. azula-docs

- [x] 5.1 Rename the vocabulary across specs and archived changes (45 files)
- [x] 5.2 Rename the two identity requirements and every reference
- [x] 5.3 Correct the `iroh-kmp` API names — the mechanical pass yields `endpointId()`/`connectByEndpointId`/`remoteEndpointId`, which never existed
- [x] 5.4 Replace the falsified "Backward-compatible transport surface" requirement
- [x] 5.5 Re-check the relay hostnames the `cli-distribution` design says to re-verify on an iroh upgrade — identical between 1.0.0 and 1.0.3

## 6. Verification

- [x] 6.1 `iroh-kmp`: 14/14 tests, clippy, full Gradle cross-compile (3 Android ABIs, 3 iOS targets, JVM)
- [x] 6.2 `azula-cli`: 332/332 + 1 integration, clippy
- [x] 6.3 `azula-app`: full `./check` across every module on jvm/android/iosSimulatorArm64, resolving 0.2.0 from Central with the local copy deleted so there was no fallback
- [x] 6.4 `CrossLanguageVectorTest` 4/4 — Rust-produced vectors decode and re-encode byte-identically in Kotlin
- [x] 6.5 **On hardware (Pixel 10a):** app bound a real endpoint via iroh 1.0.3 over JNI and went online through `usw1-1.relay.n0.iroh.link`; paired to an isolated `azula mcp` bridge over the `/i/` deeplink; hole-punched to `direct · 13ms · e2e`; invite validated, hello frame parsed, peer registered, message round-tripped, and the CLI registry persisted the phone's endpoint id with the consumed invite id matching the handshake log
- [x] 6.6 Ship: iroh-kmp 0.2.0 (Central), azula-cli v0.2.0 (crates.io + npm + GitHub Release), azula-app v0.0.7 (Play internal + TestFlight)

## 7. Known gaps

- [ ] 7.1 The Homebrew tap does not exist — the release workflow's "Bump Homebrew tap" job is skipped and there is no `homebrew-azula` repo in the org, yet `cli-distribution/spec.md` requires the channel. Pre-existing, not caused by this change
