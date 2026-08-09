## 1. Flip legacy-inbound defaults

- [x] 1.1 Flip `allowLegacyInbound` default to off in the app. *(Removed it
      instead — the sunset retires the setting, not just its default.)*
- [x] 1.2 Flip `--allow-legacy` default to off for CLI `serve`/`serve-mcp`/
      `mcp`. *(Removed the flag outright, from those three plus `relay`,
      `mailbox`, `terminal` and `run`.)*
- [x] 1.3 Confirm no old clients remain in the field before flipping (release
      gate, not a code change). **Confirmed by Sal, 2026-08-09**, after the
      code had landed — 1.1/1.2 removed the hatch outright rather than flipping
      a default, so the confirmation is what makes cutting off any remaining
      pre-invite client an accepted cost rather than an open risk. Nothing in
      the repo can answer this; it needed a human.

## 2. Remove the unverified-inbound path

- [x] 2.1 Remove the "unverified pending request" admission path once 1.1/1.2
      have shipped and no old clients remain.

## 3. Remove legacy link parsing

- [x] 3.1 Remove the `/s/` and `/connect/` parse branches in
      `azula-cli/src/link.rs`.
- [x] 3.2 Remove the equivalent parse branches in
      `azula-app/link/.../DeepLink.kt`.
- [x] 3.3 Remove the `/s/` and `/connect/` routes in `azula-site`.

## 4. Worker-side signature verification

- [x] 4.1 Parse the endpoint id out of the postcard ticket in TS (`azula-site`).
- [x] 4.2 Verify the Ed25519 signature on the `/i/` invite page instead of
      trusting the flag bit for the "signed" badge.
- [x] 4.3 Add test vectors (reuse the shared V1/V2 vectors in
      `openspec/specs/invitations/design.md`).

## 5. Docs

- [x] 5.1 Update `openspec/specs/invitations/design.md` ("Transition /
      compat" and "Future work") once this change lands.
