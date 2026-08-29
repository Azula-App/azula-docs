## 1. Convention and shared decisions

- [ ] 1.1 Confirm each proposed pin is installable: run `mise install` for
      `temurin-21.0.12+8.0.LTS`, `temurin-17.0.20+8`, `rust 1.98.0`,
      `node 22.23.2` and `node 24.20.0` — verify each resolves and reports its
      expected version, and substitute the nearest available build if one does
      not
- [ ] 1.2 Add the toolchain convention to `project.md`: exact pins in a
      per-repo `mise.toml`, CI reads from it, platform SDKs stay host-provided,
      and `mise trust` is a one-time per-repo step — verify the build/verify
      section no longer instructs anyone to set `JAVA_HOME`
- [ ] 1.3 Add the action-pinning convention to `project.md`: GitHub Actions are
      referenced by full commit SHA with the release tag as a trailing comment
      (`uses: owner/action@<sha> # vX.Y.Z`), never by tag alone — verify the
      convention names both halves as required

## 2. `azula-docs` (no build — safest first)

- [ ] 2.1 Add `azula-docs/mise.toml` pinning `node = "22.23.2"` and declaring
      the `openspec` CLI — verify `openspec validate --all` runs from the repo
      without an `npx -p @fission-ai/openspec` prefix
- [ ] 2.2 Update `CLAUDE.md`/`AGENTS.md` if they describe how to obtain the
      CLI — verify the documented commands run as written in a fresh shell

## 3. `azula-site` (CI only, no release)

- [ ] 3.1 Add `azula-site/mise.toml` pinning `node = "22.23.2"` — verify
      `npm install && npm run typecheck && npm test && npm run build` passes
      locally under it
- [ ] 3.2 Replace `setup-node` in `ci.yml` with SHA-pinned
      `jdx/mise-action@c2a87611a18de5b3828c5652fe268e992400cb5c # v4.3.0`,
      preserving npm dependency caching as its own step — verify a CI run is
      green and its duration is not materially worse than the previous run
- [ ] 3.3 Confirm `node scripts/check-build.mjs` still passes under node 22.23.2
      — verify the build-output checks (Markdown twins, no third-party
      resources) still hold

## 4. `azula-cli`

- [ ] 4.1 Add `azula-cli/mise.toml` pinning `rust = "1.98.0"` and
      `node = "24.20.0"` — verify `cargo build` succeeds locally under it
- [ ] 4.2 Replace both `dtolnay/rust-toolchain@stable` references and
      `actions/setup-node@v4` in `release.yml` with the SHA-pinned mise action
      — verify no tag-only action reference remains in the file
- [ ] 4.3 Add an explicit `rustup target add ${{ matrix.target }}` step in
      place of the removed `targets:` input — verify each matrix leg still
      produces its `azula-<version>-<target>.tar.gz`
- [ ] 4.4 Confirm the `cross`-based `aarch64-unknown-linux-musl` leg is
      unaffected, since it builds inside Docker rather than the host toolchain
      — verify that artifact is still produced and is still statically linked

## 5. `iroh-kmp`

- [ ] 5.1 Add `iroh-kmp/mise.toml` pinning `java = "temurin-17.0.20+8"` and
      `rust = "1.98.0"` — verify `./gradlew publishToMavenLocal` succeeds with
      `ANDROID_HOME` set and **no** `JAVA_HOME` set by hand
- [ ] 5.2 Replace `setup-java` and `dtolnay/rust-toolchain` in `ci.yml` with
      the SHA-pinned mise action — verify `cargo test` and
      `cargo clippy -D warnings` still pass on Linux
- [ ] 5.3 Do the same in `publish.yml`, adding an explicit `rustup target add`
      for the six Android and iOS targets — verify the target list matches the
      one removed from the action input, exactly
- [ ] 5.4 Verify the two-JDK case end to end: from a single shell, `cd` between
      `iroh-kmp/` and `azula-app/` and confirm `java -version` reports 17 and
      21 respectively with no manual environment change

## 6. `azula-app` (largest blast radius)

- [ ] 6.1 Add `azula-app/mise.toml` pinning `java = "temurin-21.0.12+8.0.LTS"`
      — verify `./kotlin check` passes locally under it
- [ ] 6.2 Replace both `setup-java` steps in `publish.yml` (the Android job and
      the macOS/iOS job) with the SHA-pinned mise action, leaving NDK, Xcode
      and signing-key steps untouched — verify the workflow file's non-toolchain
      steps are byte-identical to before
- [ ] 6.3 Confirm `release.yml` needs no change, since it only cuts tags and
      freezes the changelog — verify by inspection that it invokes no toolchain

## 7. Spec and release verification

- [ ] 7.1 Update `specs/iroh-kmp/design.md`'s toolchain prose to match the
      modified spec requirement — verify it no longer instructs setting
      `JAVA_HOME`
- [ ] 7.2 Dispatch `azula-app/publish.yml` with `dry_run=true` against a test
      tag — verify it builds and validates without shipping
- [ ] 7.3 Dry-run `iroh-kmp`'s publish path far enough to prove the JDK 17 and
      Rust targets resolve on `macos-latest` — verify without releasing to
      Maven Central
- [ ] 7.4 Grep every workflow across all repos for tag-only action references —
      verify none remain
- [ ] 7.5 Cross-check `openclaw-channel-plugin` (whose task 2.1a already ships
      `azula-openclaw/mise.toml`) against the convention, per design D7 —
      verify its pin matches this change's node version and that nothing pins
      node outside mise
