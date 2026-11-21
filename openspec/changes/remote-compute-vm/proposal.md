## Why

Claude Code and Codex cloud sandboxes are Linux containers with proxied HTTPS
egress only. They can't build or test anything that needs Apple hardware, and
they can't reach a developer's own machines. Sal wants those agents to use his
Apple silicon MacBook Pro as remote compute: run commands in an isolated VM on
the laptop, stream the output back, and move files in and out.

No turnkey tool covers both hosted sandboxes (researched 2026-11-21: GitHub
self-hosted runners are batch-only; Tailscale + SSH needs SSH credentials and
a VPN the Claude Code sandbox can't run; vendor "self-hosted runner" products
move the whole agent onto the Mac instead). azula already has what the hard
part needs: iroh connections dialed by public key that traverse NAT and fall
back to an HTTPS relay, plus a CLI that installs in cloud sandboxes via npm.

The first draft of this change was written in a ChatGPT session ("Remote
Compute Tools", 2026-11-21) whose push was blocked; it was rebuilt here, and
the decisions below that differ from that draft say so.

## What Changes

- **New `azula compute` and `azula vm` command groups.** Client verbs
  (`compute exec`, `compute doctor`, `vm start|stop|status`) run on any OS and
  reach a host by a grant token. Host verbs (`compute serve`, `compute grant|
  grants|revoke`, `vm create|delete|list`) run on Apple silicon macOS only.
- **A compute broker** (`azula compute serve`) on the Mac: an iroh endpoint
  serving ALPN `azula/compute/1` that authenticates grants, manages VMs, and
  splices authorized job streams to the guest.
- **`azula-vm`, a Swift helper** in `azula-cli/vm/helper/` that owns
  Virtualization.framework: one process per running VM, controlled over stdio,
  exposing the guest's vsock port as an owner-only Unix socket.
- **`azula-guest`, a static Linux worker** in `azula-cli/vm/guest/` that runs
  inside the VM, listens on vsock, and executes jobs as an unprivileged user.
- **Linux guests first** (Debian 13 arm64 cloud image, cloud-init NoCloud);
  macOS guests are a follow-up.
- **iroh 1.0 → 1.5**, plus endpoint options every azula endpoint gets: relay
  connections honor `HTTPS_PROXY`/`NO_PROXY`, `AZULA_RELAY_ONLY=1` disables
  direct UDP paths, and new code waits for the relay with a deadline.
- Existing commands (`terminal`, `run`, `mcp`, messaging) are unchanged.

## Capabilities

### New Capabilities
- `remote-compute`: grants, the compute broker, the exec protocol, VM
  lifecycle, and the host/guest isolation rules.

### Modified Capabilities
- None. (`cli-surface` gains two noun groups, specified in `remote-compute`.)

## Impact

- `azula-cli`: new `src/compute/` module and CLI verbs; `vm/helper/` (Swift
  package) and `vm/guest/` (standalone Rust crate) join the repo; iroh bump
  touches every endpoint; the macOS release artifact gains the signed
  `azula-vm` helper and the `azula-guest` Linux binary. Linux and Windows
  builds and artifacts don't change beyond the iroh bump.
- Hosts need Apple silicon macOS 13+ and ~4 GB disk per VM (APFS clones of a
  3 GB image, grown sparse).
- Cloud environments must allow the n0 relay hostnames (see the azula-cli
  README) through their egress allowlist.
