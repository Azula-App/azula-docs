## Context

Three defects in azula-cli, all verified against source, all variations on one
theme: the CLI derives an identity from the wrong value.

A fourth found alongside them — `send_message` reporting `ok` for a message
the peer will never see — is tracked separately as
`cli-send-delivery-truthfulness`. It is the only one needing a cross-repo
decision, and holding it out keeps this change to the data-loss fix.

The registry is the sharp one. `Device` rows live in `devices.json` with
`{name, ticket, added_at, invite}`. Two facts combine badly:

- `cmd_pair` (`src/cli/legacy.rs:198`) defaults a device's name to
  `token.chars().take(8)` — the first 8 characters of the *serialized ticket
  text*.
- `registry::add` (`src/registry.rs:167`) finds an existing row by
  `d.name == device.name` and **replaces** it.

Before iroh 1.0 the ticket text of an invite-derived pairing was the bare
64-hex endpoint id, so those 8 characters were 4 bytes of endpoint id —
distinguishing in practice. The `NodeTicket` → `EndpointTicket` rename
(`changes/archive/2026-08-03-endpoint-rename/`) moved pairing to a
serialization carrying a constant `endpoint` prefix. The name derivation now
reads that prefix. Every invite-paired device is named `endpoint`, and the
second one silently replaces the first.

The registry already knows how to do this properly:
`registry::find_by_endpoint_id` (`src/registry.rs:188`) resolves a stored
`ticket` in either of its two shapes — a dialable `EndpointTicket` string, or
a bare endpoint-id hex string written by accept-side registration — to an
`EndpointId`. The lookup helper for the fix exists; `add` simply does not use
it.

The other two:

- **Silently dropped globals.** Root `Cli` (`src/cli/mod.rs:33`) does
  `#[command(flatten)] serve: legacy::ServeArgs`, and `ServeArgs` defines
  `--name`/`--description` (`src/cli/legacy.rs:162-172`). Flattening makes
  clap *accept* them at the root, but `cli.serve` is read only in the
  bare-`azula` branch (`src/cli/mod.rs:253`). `azula --name foo message send …`
  parses cleanly and discards `foo`.
- **Unlabellable sessions.** `message::send` passes `None` for
  `core::establish`'s `name` (`src/cli/message.rs:49`), so `own_name` falls to
  `bridge-<8 hex of session endpoint id>` (`src/core/mod.rs:249`) and the
  phone titles the conversation `bridge-1a04843c`.

## Goals / Non-Goals

**Goals:**

- Pairing two devices from invites produces two rows. No pairing silently
  destroys an existing registry entry.
- A registry row's identity is the thing that actually identifies a device.
- A one-shot CLI session can be labelled; a flag that is accepted is applied.

**Non-Goals:**

- Delivery reporting. `send_message` returning `Sent` on a completed local
  write is real and verified, but it is `cli-send-delivery-truthfulness`'s
  subject, not this change's.
- No new protocol frame and no app-side change; this change stays inside
  azula-cli.
- Not reworking `--allow-legacy` or the invite gate — that is
  `invitations-legacy-sunset`.
- Not changing `Device`'s serialized shape, the ticket formats, or the
  global/project two-file layout.
- Not auto-repairing registries already damaged by the overwrite. The lost
  row is gone; it cannot be reconstructed from what remains.

## Decisions

### 1. Default pair name comes from the decoded endpoint id, bare 8 hex

`cmd_pair` decodes the ticket to an `EndpointId` and takes the first 8 hex
characters of *that*, rather than of the ticket's serialized text.

Bare (`198896c5`), with no prefix, because that is byte-for-byte what the
pre-rename derivation produced: when the ticket *was* the endpoint id, "first
8 chars of the ticket" and "first 8 hex of the endpoint id" were the same
string. This buys a property worth having — **re-pairing a device that was
registered before the rename yields its existing name**, so it matches its
own row under the new endpoint-id de-dup (Decision 2) and updates in place
instead of forking. The fix is a restoration of intended behavior, not a new
convention.

It also stays consistent with the `term-<8 hex>` /
`mailbox-peer-<8 hex>` shapes used for accept-side naming
(`src/term.rs:236`, `src/mailbox_role.rs:153`), which take the same 8 hex of
the remote endpoint id and add a role prefix. `pair` has no role to name, so
it stays bare.

*Alternatives considered.* Strip the known ticket prefix before truncating —
rejected: it re-derives from serialized text, so the next serialization
change silently re-breaks it, and it is exactly the class of bug being
fixed. Prefix with `device-` — rejected: cosmetic, and it breaks the
pre-rename name-match property above. Use the phone's announced `Hello{name}`
— rejected: not available at `pair` time; pairing records a ticket without
dialing.

### 2. `registry::add` de-dupes by endpoint id, falling back to name

The de-dup key becomes the ticket's decoded endpoint id, reusing the
resolution logic that `find_by_endpoint_id` already implements for both
stored ticket shapes. Two devices with different endpoint ids can no longer
collide, whatever they are called; re-pairing a known device updates its own
row even if it was renamed by hand.

Rows whose ticket does not resolve to an endpoint id (hand-edited, or a shape
we do not recognize) keep the current name-equality behavior. That preserves
the manual-editing workflow the registry README advertises, and means the
change cannot make an unparseable row unreachable.

Display name stays a unique, user-facing handle — it is what `--device` and
`ensure_device` resolve against (`src/core/mod.rs:590`, `602`) — so `add`
must still avoid producing two rows with the same name. When a *different*
endpoint id arrives bearing a name that is already taken, the new row gets a
disambiguated name rather than overwriting: the same 8-hex derivation
extended until unique. Silent overwrite is the bug; silent name collision
would just relocate it.

*Alternatives considered.* Key on the full ticket string — rejected: the same
device re-paired through a fresh invite carries a different ticket text but
the same endpoint id, and would fork a duplicate row. Key on name but error
on collision — rejected: it turns a routine second pairing into a failure the
user must resolve by inventing a name, when the endpoint id already tells us
these are two different devices. Add a separate `id` field to `Device` —
rejected for now: it changes the on-disk shape, and the endpoint id is
already recoverable from `ticket`; several accept-side call sites construct
`Device` exhaustively (the same pressure that put relay hints in a sibling
file rather than a new field, per `project.md`).

### 3. Merge precedence is restated in terms of endpoint id

`registry::load` merges global then project into a map keyed by `name`
(`src/registry.rs:121-131`), and the `mcp-bridge` requirement documents
project-wins "on a name collision". With rows identified by endpoint id, the
same device present in both files must merge as one row — keyed by endpoint
id, project winning — and name collision between two *different* endpoint ids
resolves by the same disambiguation as Decision 2 rather than by dropping
one. Unresolvable rows continue to merge by name.

### 4. `--name`/`--description` become real globals

Move them out of `ServeArgs` onto `Cli` as genuine global options, and pass
them into `core::establish` from the verbs that establish a core, so
`own_name` is the operator's label when given and `bridge-<hex>` otherwise.
The bare-`azula` serve path keeps reading them, so its behavior is unchanged.

Threading rather than rejecting, because there is a real use — labelling a
one-shot session so a phone conversation is not titled `bridge-1a04843c` —
and the plumbing already exists: `establish` takes `name: Option<String>` and
`Frame::Profile` carries name and description.

One collision to respect: `pair` has its own `--name`, meaning *the device
being paired*, not this session. Those are different nouns. Clap scopes a
subcommand's own option above an inherited global, so `azula pair --name foo`
must keep binding to the device name; a `pair`-scoped global would be
ambiguous to a reader even where it parses. Verbs that establish no core
(`pair`, `devices`) simply do not consume the session globals — and a flag
that cannot apply should say so rather than be swallowed, which is the
principle the whole defect violates.

*Alternative considered.* Reject `--name` on subcommands that ignore it —
rejected as the primary fix: it resolves the silent-drop without delivering
the labelling that makes the flag worth having.

## Risks / Trade-offs

- **A user's registry may already be damaged.** → Not recoverable and not
  pretended otherwise. The migration is read-side (see Migration Plan): warn,
  do not rewrite.
- **Renaming a device no longer forks its row.** Someone relying on rename-to-
  duplicate loses that; it was an artifact of name-keying, not a feature.
  Endpoint-id keying is the point of the change. → Called out in the delta
  spec as the modified behavior.
- **Disambiguated names are less predictable.** A second device may land as
  `198896c5-2` (or an extended hex run) rather than a name the user chose.
  → `pair --name` remains the way to control it, and `pair` prints the name
  it assigned, as it does today.
- **Promoting globals shifts clap parsing.** `azula pair --name` must keep
  its device-name meaning. → Explicit regression test.

## Migration Plan

1. Ship the derivation and de-dup fixes together. Shipping the name fix alone
   leaves name-keyed replacement in place; shipping de-dup alone leaves every
   invite pairing named `endpoint`.
2. **Read-side migration only.** On load, a row named `endpoint` (or any row
   whose name matches the broken derivation) is left exactly as written. Rows
   are never silently renamed — a user may have edited `devices.json` by hand,
   which the shipped README explicitly invites.
3. `azula devices` warns when it sees a row named `endpoint`, naming the
   likely lost pairing and pointing at `pair --name` / a hand edit as the fix.
   The user decides; the CLI does not rewrite their file.
4. Re-pairing a pre-rename device reproduces its existing name (Decision 1)
   and matches its row by endpoint id, so it updates in place — no duplicate,
   no user action.
5. Rollback is a revert: no on-disk shape changes, so a downgraded binary
   reads a registry written by the fixed one. It would resume name-keyed
   de-dup, which is the bug, not a corruption.

## Open Questions

- Should `azula devices` gain a `--repair` that renames `endpoint` rows from
  their ticket's endpoint id? Deferred: the read-side warning covers the
  damage, and a rewrite of a hand-editable file wants its own decision.
- How far should disambiguation extend the hex run before giving up? Two
  endpoint ids sharing a 16-hex prefix is not a real collision risk, but the
  loop needs a defined stopping point rather than an unbounded extend.
