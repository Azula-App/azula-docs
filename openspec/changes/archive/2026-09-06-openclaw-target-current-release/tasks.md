## 1. Pin the release

- [x] 1.1 Pin the `openclaw` devDependency to exactly `2026.9.2` (no range, per
      design D1) — verify `npm ls openclaw` reports that exact version and
      `package.json` carries no caret or tilde
- [x] 1.2 Run `npm run typecheck` and `npm test` against it — verify the
      typecheck is clean and all unit tests pass. Any source change needed here
      is a finding about the release: record it in the change rather than
      absorbing it silently (design D1)

## 2. Declare surfaces honestly

- [x] 2.1 Audit what the plugin actually registers against the consent
      vocabulary (`channels`, `providers`, `tools`, `contracts`, `hooks`,
      `mcpServers`, `cliCommands`, `cliBackends`, `skills`,
      `dangerousConfigFlags`) — verify by reading `index.ts` and `src/channel.ts`
      that one channel is registered and nothing else
- [x] 2.2 Make `openclaw.plugin.json`'s declaration match that audit exactly,
      neither over- nor under-declaring — verify the consent summary shown at
      install names the channel and lists no surface the plugin never uses

## 3. Verify by installing, not by typechecking

- [x] 3.1 Install into a throwaway profile on 2026.9.2 with both gates
      (`--force` for the local path, `--accept-capabilities`) — verify the
      install completes rather than aborting at a prompt
- [x] 3.2 Run `plugins doctor` and `channels list --all` in that profile —
      verify no plugin issues and that `azula` is offered as a channel
- [x] 3.3 Configure an account in that profile and confirm it reads back as
      installed/configured/enabled, and that an invalid config is still
      rejected at validation time — verify the config schema survived the
      release
- [x] 3.4 Remove the throwaway profile afterwards — verify nothing is left
      under `~/.openclaw-<name>`

## 4. Documentation

- [x] 4.1 Update the README's install command to one that completes unattended
      on 2026.9.2 — verify by running exactly what the README says, in a fresh
      throwaway profile
- [x] 4.2 State what capability consent covers for this plugin, including the
      part the surface vocabulary cannot express: that it runs the `azula`
      binary as a child process and reads the files it is asked to attach
      (design D2) — verify the README's claim matches what the manifest
      declares
- [x] 4.3 State the OpenClaw release the plugin is built against (2026.9.2) —
      verify an operator can determine it from the README without installing.
      Nothing has shipped, so there is no older release to deprecate
- [x] 4.4 Keep `--force` in the development section only, not in the published
      install instructions (design D1 risk) — verify the npm install path in
      the README needs no trust override

## 5. Close out

- [ ] 5.1 Re-run the hardware harness (`scripts/e2e.mjs`) against a connected
      phone to confirm the release change did not disturb the round trip.
      NOT RUN: the plugin's own source is byte-identical (task 5.2), and the
      harness drives azula's bridge rather than the OpenClaw SDK, so there is
      no path by which this change could affect it. Worth running opportunis-
      tically next time a phone is connected, not worth a pairing dance now
- [x] 5.2 Record whether any source edit was needed — NONE. Across 2026.7.1-2
      → 2026.8.1 → 2026.9.2 the plugin's TypeScript is unchanged: clean
      typecheck and 80 passing tests at each. Everything that moved was the
      install path and the docs. Whether that holds is not luck to rely on —
      it held because the plugin imports 2 of ~300 SDK subpaths
