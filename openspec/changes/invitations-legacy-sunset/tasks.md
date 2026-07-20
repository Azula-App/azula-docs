## 1. Flip legacy-inbound defaults

- [ ] 1.1 Flip `allowLegacyInbound` default to off in the app.
- [ ] 1.2 Flip `--allow-legacy` default to off for CLI `serve`/`serve-mcp`/
      `mcp`.
- [ ] 1.3 Confirm no old clients remain in the field before flipping (release
      gate, not a code change).

## 2. Remove the unverified-inbound path

- [ ] 2.1 Remove the "unverified pending request" admission path once 1.1/1.2
      have shipped and no old clients remain.

## 3. Remove legacy link parsing

- [ ] 3.1 Remove the `/s/` and `/connect/` parse branches in
      `azula-cli/src/link.rs`.
- [ ] 3.2 Remove the equivalent parse branches in
      `azula-app/link/.../DeepLink.kt`.
- [ ] 3.3 Remove the `/s/` and `/connect/` routes in `azula-site`.

## 4. Worker-side signature verification

- [ ] 4.1 Parse the node id out of the postcard ticket in TS (`azula-site`).
- [ ] 4.2 Verify the Ed25519 signature on the `/i/` invite page instead of
      trusting the flag bit for the "signed" badge.
- [ ] 4.3 Add test vectors (reuse the shared V1/V2 vectors in
      `openspec/specs/invitations/design.md`).

## 5. Docs

- [ ] 5.1 Update `openspec/specs/invitations/design.md` ("Transition /
      compat" and "Future work") once this change lands.
