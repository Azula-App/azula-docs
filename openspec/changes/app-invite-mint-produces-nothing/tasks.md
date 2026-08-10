Work lands in `azula-app`. Create a worktree first —
`git -C azula-app worktree add ../.worktrees/azula-app--app-invite-mint-produces-nothing -b app-invite-mint-produces-nothing`
— per the Conventions in `openspec/project.md`; never switch branches in the
shared checkout.

**Group 1 gates everything else.** Three failure points produce the observed
symptom (see `design.md`), and the fix differs per layer. Do not write a fix
before 1.5 names the layer.

## 1. Find the failing layer

- [ ] 1.1 Reproduce on a **current** build, not the 2026-08-03 one the symptom
      came from. Record the build sha. If it mints, persists, and presents
      correctly, stop: close this change as already-fixed and correct the note
      in `changes/archive/2026-08-09-cli-naming-and-registry-keying/tasks.md`
      task 5.2, which cites this change as the blocker.
- [ ] 1.2 Find the code behind the create-invite sheet's confirm button and
      determine whether a mint is attempted at all, whether it throws, and
      what it returns. Compare against azula-cli's working path
      (`cmd_invite_mint`, `invite.rs`), which mints, persists to
      `~/.azula/invites`, and prints a URL plus QR.
- [ ] 1.3 Determine where app-side issued invites are meant to persist, and
      whether anything is written. On the observed device the whole container
      was `files/{conversations,eventlog,profileInstalled}` +
      `shared_prefs/{azula_peers.xml,azula_secret.xml}`, with no candidate
      store, and `azula_peers.xml` gained no payload across two mints. If no
      issuer-side store exists, say so plainly — it means
      "Issuer-Side Persistence Is Authoritative" has never been satisfiable on
      the app side and app-issued invites have never been redeemable.
- [ ] 1.4 Rule out a device-specific cause: repeat on a clean emulator install
      (throwaway state — prefer an emulator over a personal phone) or a second
      device. The observed device had exactly one known peer and one
      conversation.
- [ ] 1.5 Record the finding in `design.md` — which of mint / persist / present
      fails, and why — and only then pick the fix.

## 2. Fix, per the 1.5 finding

- [ ] 2.1 Implement the fix for the failing layer.
- [ ] 2.2 Whatever the layer, make failure visible: a mint that cannot produce
      a usable invite must not dismiss the sheet as though it had (Decision 3).
- [ ] 2.3 If 1.3 found no issuer-side store, note revocation as a follow-up —
      `azula invite revoke` and the "Revoked invite is rejected" scenario both
      need a store to operate on. Do not build revocation UI here.

## 3. Verify

- [ ] 3.1 Unit/UI coverage per `openspec/specs/testing/` for the layer fixed.
- [ ] 3.2 On-device: complete the create-invite flow and confirm the user is
      left holding the `https://azula.app/i/…` link in a transferable form.
- [ ] 3.3 End-to-end, closing the loop this was found in: mint an invite on
      the phone, pair it from the CLI with `azula pair <url>`, and confirm the
      device lands in `devices.json` named from its endpoint id. This also
      completes the two-device form of
      `changes/archive/2026-08-09-cli-naming-and-registry-keying/` task 5.2 —
      update that note when it passes.
- [ ] 3.4 Confirm a minted invite actually redeems: have a peer present it and
      verify the issuer recognises it rather than rejecting it as unknown.
- [ ] 3.5 Check iOS behaves the same. Note that nothing available can drive a
      physical iPhone; use the simulator, or Sal's hands on a device.
- [ ] 3.6 Add a changelog entry per `openspec/specs/release-notes/` — this is
      azula-app and user-observable, so it belongs in the user-facing tier.
