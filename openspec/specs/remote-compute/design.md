# remote-compute — design

Shipped in azula-cli 0.4.1 (2026-11-22). The decisions and their rationale —
including where this departs from the first ChatGPT draft — are recorded in
the archived change
[`changes/archive/2026-11-21-remote-compute-vm/design.md`](../../changes/archive/2026-11-21-remote-compute-vm/design.md)
(D1–D11), together with the scenario catalog (H1–H9, S1–S31) the tests cover.
This page is the map for whoever works on it next.

## Shape

```
cloud sandbox             Mac host (Apple silicon)                      Linux VM (Debian 13 arm64)
azula compute …  ─iroh─▶  azula compute serve ─unix─▶ azula-vm ─vsock─▶ azula-guest
(client, any OS)          (broker; grants, VMs)        (Swift helper,     (static musl worker;
                                                        one per VM)        durable jobs, files)
```

| Piece | Where | Notes |
|---|---|---|
| Wire contract (frames, guest protocol, helper CLI, bundles) | `azula-cli/vm/README.md` | §1 frame test vector is mirrored by both codecs |
| Broker, grants, client, CLI, exit codes | `azula-cli/vm/BROKER.md`, `src/compute/`, `src/cli/{compute,vm}_cmd.rs` | ALPN `azula/compute/1` |
| VM helper | `azula-cli/vm/helper/` (Swift, `build.sh`) | ad-hoc signed with `com.apple.security.virtualization` |
| Guest worker | `azula-cli/vm/guest/` (own `[workspace]`, `build.sh`) | static `aarch64-unknown-linux-musl`, linked with rust-lld |
| End-to-end check | `azula-cli/vm/e2e/cloud.sh` | run from a real sandbox; see below |
| User docs | azula.app `/docs/compute` and the inline recipe in `/llms.txt` (`azula-site/src/lib/llms.ts`) | |

## Running it from Claude Code cloud

The sandbox has no UDP and an HTTPS CONNECT proxy that re-signs TLS with a CA
in the system store. What makes it work:

- Allowlist `use1-1`/`usw1-1`/`euc1-1`/`aps1-1.relay.n0.iroh.link` and
  `dns.iroh.link`. Sal's Claude Code cloud environment `azula-cli` has exactly
  these; the Default environment has none and gets proxy 403s.
- azula sends relay traffic through `HTTPS_PROXY` and uses the OS trust store
  whenever a proxy or relay-only is in play (`src/endpoint.rs`).
- Clients home on the token's relay, so both directions use the host's relay.
- `AZULA_RELAY_ONLY=1` skips UDP attempts.

Measured from the sandbox on 0.4.0/0.4.1: bind+relay 1.0–1.5 s, dial 150–250
ms, auth ~200 ms; `vm/e2e/cloud.sh` ALL PASS in 1m28s. n0's public relays
rate-limit bulk transfers (a WARN during a 9 MB push); fine at that size.

## Known limits and next steps

- A broker restart stops its VMs (jobs become `interrupted`); making helpers
  adoptable across broker restarts is the next robustness step (D11).
- Agent-provisioned VMs (`provision` op with a name prefix and quota) are
  designed in D10, not built.
- macOS guests: macOS 27's `VZMacGuestProvisioningOptions` (user + SSH, no
  Setup Assistant) is the path (D3).
- Codex Cloud hasn't been tested; it needs Sal's sign-in and the same relay
  allowlist.
