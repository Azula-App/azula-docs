## Why

`azula pair` names a new device after the first 8 characters of its ticket
string. That was distinguishing when tickets were bare 64-hex endpoint ids
(`198896c5…`), but the iroh 1.0 `NodeTicket` → `EndpointTicket` rename (see
`changes/archive/2026-08-03-endpoint-rename/`) gave the serialized form a
constant `endpoint` prefix. Every device paired from an
`https://azula.app/i/…` invite is therefore named the literal string
`endpoint`.

That is not cosmetic. `registry::add` de-duplicates by display *name* and
replaces the matching row, so pairing a second phone without an explicit
`--name` silently overwrites the first phone's entry in `devices.json`. The
user is told `Paired device 'endpoint'` both times and loses a device with no
error. Reproduced once already by a real pairing.

One adjacent defect, found in the same session and sharing the theme — the
CLI derives an identity from the wrong value — is folded in rather than left
to rot: `--name`/`--description` are accepted at the top level and silently
dropped by every subcommand, so a one-shot CLI session cannot be labelled and
phone conversations are titled `bridge-1a04843c`.

A third defect found alongside these — `azula message send` printing `ok` for
a message the recipient will never see, because the app closed the stream
while the session sits in its pending-approval queue — is deliberately **not**
in this change. It is the only one of the three needing a cross-repo decision,
and it is tracked separately as `cli-send-delivery-truthfulness`.

## What Changes

- **BREAKING (registry semantics):** a row in `devices.json` is identified by
  its endpoint id, not its display name. `registry::add` de-dupes on the
  ticket's endpoint id, so re-pairing a known device updates its own row and
  two distinct devices can never collide. Renaming a device stops being a way
  to fork its registry entry, and the merge precedence rule that reads
  "on a name collision" is restated in terms of endpoint id.
- `azula pair`'s default device name is derived from the ticket's decoded
  endpoint id (first 8 hex chars, matching the legacy `term-198896c5` shape)
  rather than from the ticket's serialized text, so it stays distinguishing
  across ticket-format changes. Pairing two devices from invites produces two
  distinct rows.
- A ticket whose endpoint id cannot be decoded SHALL fail pairing loudly
  rather than fall back to a truncation that may collide.
- `--name`/`--description` become real global options rather than
  `ServeArgs` fields that happen to parse at the root, and the verbs that
  establish a core thread them into the session's announced profile. A
  session can be labelled; `bridge-<hex>` remains the default when unset.

## Capabilities

### New Capabilities

None. Every behavior here belongs to an existing capability.

### Modified Capabilities

- `mcp-bridge`: three requirements change.
  - *Device Registry Precedence* — a registry row's identity becomes its
    endpoint id; `add` de-dupes on it, and the global/project merge rule is
    restated accordingly.
  - *Pairing Ticket Forms and Peer Naming* — currently specifies only
    accept-side peer naming; gains the pair-side rule for a newly registered
    device's default name, which is presently unspecified.
  - *Stable Bridge Identity* — `own_name` gains an explicit override path so
    a session is labellable, with `bridge-<hex>` as the fallback.
- `cli-surface`: one requirement is added — the global-option surface.
  `--name`/`--description` must either apply or be rejected, never be
  accepted and dropped.

## Impact

- **azula-cli** (the whole change; no app or site code):
  - `src/cli/legacy.rs` — `cmd_pair` default-name derivation (~L198).
  - `src/registry.rs` — `add` de-dup key (~L167); `find_by_endpoint_id`
    (~L188) already resolves both stored ticket shapes and is the lookup.
  - `src/cli/mod.rs` — root `Cli` flattens `ServeArgs` (L33) but reads
    `cli.serve` only in the bare-`azula` branch (L253); this is the
    silent-drop mechanism. Note `pair` has its own `--name` with a different
    meaning, so promotion must not collide.
  - `src/cli/message.rs` — passes `None` for the core's name (L49).
  - `src/core/mod.rs` — `own_name` derivation (~L249).
- **Existing `devices.json` files** may already hold a row named `endpoint`,
  and a user may have lost a device to the overwrite. Migration is
  read-side and must not silently rename rows a user has edited by hand.
- **Verification** per `specs/testing/`: `cargo test --workspace` and
  `cargo clippy --workspace --all-targets` for azula-cli.
- No wire-format change; `Device`'s serialized shape is unchanged.
