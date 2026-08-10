All work lands in `azula-cli`. Create a worktree first —
`git -C azula-cli worktree add ../.worktrees/azula-cli--cli-naming-and-registry-keying -b cli-naming-and-registry-keying`
— per the Conventions in `openspec/project.md`; never switch branches in the
shared checkout.

Groups 1 and 2 are the data-loss fix and ship together (see the Migration
Plan in `design.md`: shipping either alone leaves the bug). Group 3 is
independent of both.

## 1. Registry rows keyed by endpoint id

- [x] 1.1 Extract the ticket → `EndpointId` resolution currently inlined in
      `registry::find_by_endpoint_id` (`src/registry.rs:188`) into a reusable
      helper over a `Device`/ticket string, covering both stored shapes: a
      dialable `EndpointTicket` string and a bare endpoint-id hex string.
      Returns `Option<EndpointId>` — unresolvable rows are legitimate.
- [x] 1.2 Rewrite `registry::add` (`src/registry.rs:167-173`) to match an
      existing row by resolved endpoint id, replacing that row. Keep
      name-equality matching only for rows that do not resolve, so
      hand-edited registries stay editable.
- [x] 1.3 In `registry::add`, disambiguate rather than overwrite when the
      incoming device's name is already held by a *different* endpoint id:
      extend the 8-hex derivation until the name is unique in the merged
      view. Never silently replace a row belonging to another device.
- [x] 1.4 Update `registry::load`'s global-then-project merge
      (`src/registry.rs:121-131`) so the same endpoint id present in both
      files merges as one row with the project entry winning; unresolvable
      rows keep merging by name.
- [x] 1.5 Tests: two invite-derived pairings yield two rows; re-pairing a
      renamed device with a fresh ticket but the same endpoint id updates
      that row in place and creates no duplicate; a name collision between
      two different endpoint ids disambiguates and preserves both; an
      unresolvable row stays readable, mergeable, and forgettable.

## 2. Pair-side default name derivation

- [x] 2.1 Replace `token.chars().take(8)` in `cmd_pair`
      (`src/cli/legacy.rs:198-200`) with the first 8 hex characters of the
      endpoint id decoded from the ticket, via the 1.1 helper. Bare, no
      prefix — this reproduces the pre-rename name for a pre-rename device
      (see Decision 1), which is what lets 1.2 match its existing row.
- [x] 2.2 Fail pairing with an error naming the ticket when its endpoint id
      cannot be decoded, and write no registry row. Do not fall back to
      truncating the ticket text.
- [x] 2.3 Fix the confirmation line at `src/cli/legacy.rs:216`, which also
      prints `token.chars().take(8)` as the ticket preview, so the reported
      name and ticket are the values actually stored.
- [x] 2.4 Tests: pairing from an `https://azula.app/i/…` invite produces a
      name derived from the endpoint id and never the literal `endpoint`;
      two distinct invites produce two distinct names; an undecodable ticket
      exits non-zero having written nothing.
- [x] 2.5 Regression test pinning the pre-rename equivalence: a device whose
      ticket *is* a bare 64-hex endpoint id derives the same name the old
      code did, so existing rows are matched rather than forked.

## 3. Global `--name` / `--description`

- [x] 3.1 Move `--name`/`--description` off `legacy::ServeArgs`
      (`src/cli/legacy.rs:162-172`) onto root `Cli` (`src/cli/mod.rs:33`) as
      real globals, keeping the bare-`azula` serve path
      (`src/cli/mod.rs:253`) reading them exactly as it does now.
- [x] 3.2 Thread the label into `core::establish`'s `name` parameter from the
      verbs that establish a core — starting with `message::send`
      (`src/cli/message.rs:49`), which passes `None` today — so `own_name`
      (`src/core/mod.rs:249`) is the operator's label when given and
      `bridge-<8 hex>` when not. Pass `--description` through
      `Frame::Profile` on the same path.
- [x] 3.3 Reject the globals with an error naming the option on verbs that
      establish no session and cannot apply them (e.g. `devices`), rather
      than accepting and discarding.
- [x] 3.4 Verify `azula pair --name <name>` still binds to `PairArgs`' own
      device-name option and not the new global — the two are different
      nouns (Decision 4). Add a parsing regression test.
- [x] 3.5 Tests: a label supplied at the top level reaches the announced
      profile; omitting it keeps the `bridge-<hex>` default; a global on a
      verb that cannot apply it exits non-zero.

## 4. Migration and damaged registries

- [x] 4.1 Make `azula devices` warn when it loads a row named `endpoint`,
      naming the likely-overwritten pairing and pointing at `pair --name` or
      a hand edit. Read-side only — never rewrite the file, which the
      shipped `.azula/README.md` invites users to edit.
- [x] 4.2 Test that loading a registry containing an `endpoint` row warns and
      leaves the file byte-identical.

## 5. Verification

- [x] 5.1 `cargo test --workspace` and
      `cargo clippy --workspace --all-targets` clean, per
      `openspec/specs/testing/`.
- [x] 5.2 Paired two devices from two real `https://azula.app/i/…` invites and
      confirmed `devices.json` holds two rows with distinct names. This is the
      bug as originally reproduced, and it is now closed.

      Both invites were minted by real `azula invite` runs from two isolated
      identities, then redeemed through the full path — `link::parse` →
      `InvitePayload::decode` → `ticket()` → `endpoint_id_of`. The premise
      held on real data: **both decoded tickets begin with the literal string
      `endpoint`**, so the old derivation produced one name for both
      (`{'endpoint', 'endpoint'}` → 1 distinct name), which is exactly the
      collision that replaced the first row. The fix produced `68e3dd0c` and
      `75a2fe65` — two rows, both retained.

      Also confirmed on the same real data:
      - `azula devices` lists both with distinct fingerprints, rather than
        `endpoint…` for every device as it did before.
      - Re-pairing the first identity from a *fresh* invite (different ticket
        text, same endpoint id) left the registry at two rows and updated in
        place — no fork, per Decision 2.

      **Corroborated on hardware** (Pixel 10a `64271JEA313442`, app build
      2026-08-03). A real `EndpointTicket` read out of the phone's own peer
      store (`shared_prefs/azula_peers.xml` via `run-as`) begins with the
      literal `endpoint`, and pairing it with the fixed binary stored
      `6157996a` rather than `endpoint` — the defect and its fix on real
      device data, not synthesised input.

      Also visible on that device: the live conversation is titled
      `bridge-6157996a`, which is defect 2 of this change (an unlabellable
      one-shot session) as the user actually sees it.

      Not done: pairing a phone as a device from a *phone-minted* invite. The
      app's create-invite flow on that build yields nothing capturable — see
      `changes/app-invite-mint-produces-nothing/`. That blocks the literal
      two-phones form of this task, but not what it was meant to establish:
      an app-minted invite and a CLI-minted one are the same `azi…` payload
      carrying the same `EndpointTicket`, and the naming defect was entirely
      CLI-side parsing. The ticket paired above came off the phone regardless.
- [x] 5.3 Ran the executable doc examples against the built binary: all 10
      pass, including `registry-precedence` (name-keyed precedence still holds
      for the unresolvable placeholder tickets those examples use) and
      `pair-and-list` (whose `fingerprint == "cccccccc"` assertion the new
      endpoint-id fingerprint preserves via its ticket-head fallback).
- [x] 5.4 Update `openspec/specs/mcp-bridge/design.md` if the registry
      keying prose there describes the superseded name-keyed behaviour.
- [x] 5.5 **Does not apply — written in error at propose time.**
      `openspec/specs/release-notes/` governs *azula-app* ("Every change to
      azula-app that a user could observe…"), and only `azula-app/CHANGELOG.md`
      exists; azula-cli has no changelog tier and this change touches no app
      code. Nothing to record.
