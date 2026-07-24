# Testing strategy

How azula is tested, layer by layer, and which tool owns which layer. The
rule of thumb: **behavioral depth accumulates in fast in-process suites;
platform smoke flows stay thin.** Don't duplicate a scenario across layers.

## The pyramid (azula-app)

| Layer | Tool / location | What it owns |
|---|---|---|
| Logic | common unit tests — `mock-support/test/` (state layer, 26+), `network-api/test/` (protocol), `persistence-real/test@jvm/`, `core/test/`, `a2ui/test/`, `terminal-api/test/` | services, wire protocol, persistence, emulator — every platform target runs these |
| Shared UI behavior | **Compose Multiplatform UI tests on JVM** — `mock-support/test@jvm/DesktopAppE2eTest.kt` | navigation, connect flow, chat round-trip, attach menu, media bubbles/states, fullscreen viewer — driven through the real `DesktopApp` over `FakeTransport`/`InMemoryBlobStore` via the `testAzulaState` harness, semantics/testTag addressed. Deps: `$compose.uiTest` **plus** `$compose.desktop.currentOs` in `test-dependencies@jvm` (the latter supplies the Skiko native runtime `runComposeUiTest` needs) |
| Platform integration | **Maestro** — `azula-app/e2e/*.yaml` against the `-mock` apps | the real app binary on a real emulator/simulator: packaging, system UI, platform glue |

## Why both Compose UI tests AND Maestro

They see different worlds, proven concretely during the media feature
(2026-07): two real iOS bugs — `UIApplication.keyWindow` nil on scene-based
apps, and the PHPicker being torn down with Compose's transient popup-host
view controller — were **invisible to the Compose semantics tree**. A Compose
UI test clicks "Photo", the tree looks healthy, and the test passes while the
real picker never appears on screen. Only launching the built app and driving
the actual screen (Maestro, `e2e/ios-media.yaml`) caught them.

Conversely, Maestro is slow, text/point-addressed, and timing-flaky —
`waitForAnimationToEnd` dances, coordinate taps into out-of-process sheets.
It must not become the place where behavioral coverage grows.

Because the whole UI lives in `shared/`, one JVM-hosted Compose UI test run
exercises the same composables all three platforms render. Re-running the
identical suite on Android (emulator + instrumentation) or iOS (the least
mature ui-test target, hosted outside the real `ComposeUIViewController`
entry) mostly re-tests common code at much higher cost — that's why the
Compose suite runs on JVM only, and mobile platforms get thin Maestro smoke
instead.

## What belongs where

Adding a test? Pick the **lowest** layer that can catch the failure:

- Service/protocol/persistence logic → common unit test (`mock-support/test/`
  via the `testAzulaState`/`PeerPipe` harness — see `TestSupport.kt` for the
  conventions, including the "never `advanceUntilIdle`" pollRtt gotcha).
- Anything expressible as "user clicks X, sees Y" in shared Compose UI →
  the JVM Compose suite. Native OS dialogs can't be driven in-process (AWT
  file dialog, PHPicker) — inject at the picker-callback seam instead.
- Only for: does the packaged app launch, does platform glue (pickers,
  players, notifications, deep links) actually appear on screen → a Maestro
  flow, kept to one happy path per concern.

## Running

- Everything for a module: `./check -m <module>` (from `azula-app/`; needs
  network for the Amper toolchain). Never `./kotlin check` directly — see
  "Known flakes" below. The JVM Compose UI suite runs as part of
  `./check -m mock-support`.
- Maestro Android: build/install `android-app-mock`, `maestro test
  e2e/android.yaml`.
- Maestro iOS: `./kotlin build -m ios-app-mock -p iosSimulatorArm64`, install
  on a booted simulator (`xcrun simctl install <udid> <app>`), seed the photo
  library for the media flow (`xcrun simctl addmedia <udid> <img>.png`), then
  `maestro --device <udid> test e2e/ios-media.yaml`. Pin `--device` — Maestro
  otherwise grabs any connected physical iPhone.
- Screenshots land in `e2e/screenshots/` (gitignored).

## Other repos

- `azula-cli` — `cargo test --workspace` (in-process iroh integration tests:
  real endpoints, PTY bridges, bridge relay) + `cargo clippy --workspace
  --all-targets` enforced via `[workspace.lints]`.
- `azula-site` — `npm run typecheck && npm test` (vitest: pure helpers + the
  Worker's `fetch` driven directly), enforced by GitHub Actions on push/PR.
- `iroh-kmp` — `cargo check`/`cargo test` for the crate; consumers are
  exercised through azula-app's suites.

The project's Claude hooks (`.claude/` in the parent directory, per-machine;
mirrored for compatible agents as `.agents -> .claude`) auto-run the fast suites
on edit and queue `./check` per touched module at end of turn.

## `internal` is off-limits from tests (Amper + Kotlin/Native)

**A `test/` source set may not reference an `internal` declaration from its own
module's `src/`.** JVM and Android compile it happily; the Kotlin/Native leg
rejects it. This is an Amper limitation, not a rule we chose.

The failure is nasty to read, because the passing legs run first:

```
[         8 tests successful      ]          ← testJvm / testAndroid*, all green
…
ERROR :core:compileIosSimulatorArm64TestDebug core/test/Foo.kt:1:23:
    error: cannot access 'object Sha256 : Any': it is internal in file.
ERROR: cinterop failed                        ← the last line, and a red herring
```

`cinterop failed` is what `./check` prints on the way out; it has nothing to do
with cinterop. Scroll up for `it is internal in file`.

### Why

Amper wires the test compilation to the main one as a *friend* for JVM, JS,
Wasm and metadata, but not for Native. In the shipped CLI dist
(`~/Library/Caches/JetBrains/Kotlin/cli/kotlin-cli-<v>/lib/amper-cli-jvm.jar`),
`org.jetbrains.amper.compilation.KotlinCompilerArgsKt` declares a `friendPaths`
parameter on `kotlinJvmCompilerArgs`, `kotlinJsCompilerArgs`,
`kotlinWasmCompilerArgs` and `kotlinMetadataCompilerArgs` — and **not** on
`kotlinNativeCompilerArgs`. Correspondingly `JvmCompileTask`,
`MetadataCompileTask`, `Js*`, `Wasm*` and `Web*` all reference `friendPaths`,
while `NativeCompileKlibTask` and `NativeLinkTask` never mention it. So neither
`-Xfriend-modules=` nor `-friend-modules=` is ever passed to the Native
compiler. Verified in 0.11.0 (the version `azula-app/kotlin` pins) and 0.11.1
(the newest stable); 0.12.0 is dev-builds only.

Upstream, unresolved as of 2026-07-24: [KTC-4173 "Kotlin Native compilation
doesn't respect friends' relationship"](https://youtrack.jetbrains.com/issue/KTC-4173)
(Open, and the exact `iosSimulatorArm64` case) and
[KTC-5395 "internal declarations inaccessible in native test source
sets"](https://youtrack.jetbrains.com/issue/KTC-5395) (Submitted). The IDE half
of this — internal references painted red in tests,
[KTC-4141](https://youtrack.jetbrains.com/issue/KTC-4141) — was fixed in
IntelliJ 2025.1.1; the compiler half was not.

### Scope

Every module with a `test/` source set, since all of them target
`iosArm64/iosSimulatorArm64/iosX64`: `a2ui`, `core`, `link`, `markdown`,
`mock-support`, `network-api`, `shared`, `terminal-api`. Confirmed by probe in
both `core` (via `Sha256`) and `a2ui` (via `hasMarkdown`) on 2026-07-24 — it is
a per-target gap in Amper's task graph, not anything specific to `core`.

### What to do about it

Fix it at the call site. Two shapes, both already used in `core`:

- **Test through the public surface and pin literal expected values.** This is
  what `RecoveryPhraseTest` does — it asserts the canonical BIP-39 vectors
  rather than reaching for `BIP39_WORDS`, which is a better test anyway.
- **Promote the declaration**, when it stands on its own merits. `Sha256` went
  public this way. Prefer the first option; only promote when the wider
  visibility is defensible without the build constraint.

Do **not** reach for `test-settings.kotlin.freeCompilerArgs`. It *works* —
`-friend-modules=` is accepted by the Native compiler, `test-settings` scopes
correctly to the test compilation, and `test-settings@ios` keeps it off the
JVM/Android legs — which reject it outright, as an unscoped `test-settings`
shows: `Internal error: …CompilerArgumentsParseException: Invalid argument:
-friend-modules=…`. But it is unshippable, for three compounding reasons:

- **Absolute paths only.** A relative path is silently ignored — no warning, no
  error, the `internal` errors just stay. So the value would have to hardcode
  one machine's checkout, in a file that is committed.
- **One path per (target × build type).** The value must name
  `build/tasks/_<module>_compile<Target><BuildType>/<module>.klib` for each of
  Debug and Release and each iOS target. Colon-joining them does work, but the
  list has to be maintained by hand per module.
- **It targets Amper's private build layout**, which carries no compatibility
  guarantee across versions.

Re-check when Amper moves: if `kotlinNativeCompilerArgs` grows a `friendPaths`
parameter, this whole section goes away and nothing in the modules needs to
change.

## Known flakes (headless test harness)

**Run the gate as `./check -m mock-support`, never `./kotlin check` directly.**
Almost everything below traces back to one root cause — two builds running at
once — and `./check` takes an exclusive lock that prevents it. See
`project.md`, "Build / verify".

### Concurrency is the root cause (fixed by `./check`)

Measured 2026-07-22 while implementing `stabilize-headless-test-flakes`. Two
concurrent `./kotlin check -m mock-support` runs produce *three* unrelated-looking
failures, all from the same collision:

- **A CoreSimulator collision.** The losing run logs
  `com.apple.CoreSimulator.SimError, code=405: Unable to boot device in current
  state: Booted` — one build boots the sim, the other trips over it.
- **A ~36× slowdown.** An uncontended run takes ~30 s; the same run measured
  **1110 s** with another check alive. Most "hangs" are this.
- **An Amper internal error.** `Internal error: java.io.IOException: Resource
  deadlock avoided`, which fails the build outright.

Serializing removes all three, and costs nothing: two concurrent runs through
`./check` finished in **45 s** versus **53 s** unlocked, because contention
wastes more than the parallelism buys. `./check` also tolerates the historical
post-`PASSED` simulator exits (`exit code 149`, `Simulator boot timeout`) — but
only when the log positively shows tests ran and passed, so a compile error is
never suppressed. `KOTLIN_CHECK_STRICT=1` turns the tolerance off; the
classifier's own tests are in `azula-app/test/check-classify-test.sh`.

### `DesktopAppE2eTest` Compose-UI timing flakes

Cases like `clickingTheTerminalRowInTheSharedListOpensItsChat` and
`inboundOfferAutoDownloadsToComplete` have historically thrown
`ComposeTimeoutException` under load and passed on a clean re-run (originally on
5000 ms waits; re-confirmed 2026-07-10 at 20–30 s, 1 failure in 5 runs on a
pristine worktree).

Their waits are now 20–30 s and were **deliberately not raised again** in
2026-07-22: raising them 5 s → 20–30 s did not stop the flakes last time, so a
third increase is cargo-culting rather than a fix. The load these waits are
sensitive to is precisely what `./check` now prevents. If they still flake with
serialization in place, that is new information — reach for a root-cause fix
(what is actually starving?), not a bigger number.

**Caveat, stated plainly:** this flake did **not reproduce at all** during that
work — 0 `ComposeTimeoutException`s across 15 sequential and 4 concurrent runs.
So it is not demonstrated fixed; its documented trigger has been removed and it
did not appear. Treat a fresh occurrence as a live lead, not as this known
entry.

### Matcher ambiguity — a real bug that *looks* like a timing flake

`Expected exactly '1' node but found '2'` used to be listed as always-a-real-bug.
It is a real bug, but it can present as a load-dependent flake, so it deserves
its own entry. Found and fixed 2026-07-22 in `SettingsE2eTest`:

`FakeTransport.incoming()` emits its seeded conversation on a 300 ms delay, and
that conversation renders its own `ConvOverflowMenu` "⋮". A test matching a bare
`hasText("⋮")` therefore sees **one** node on an idle machine and **two** under
load — failing only when slow. The fix is to anchor the matcher
(`hasAnyAncestor(hasTestTag("persona-row-…"))`), not to widen a timeout; the test
now also waits for the ambiguous state deliberately, so it exercises the hard
case every run instead of racing it.

When a UI test fails only under load, check whether a matcher became ambiguous
before assuming the machine was slow.
