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

## Isolating a second `jvm-app` desktop instance (`AZULA_DATA_DIR`)

`jvm-app` hardcodes its storage: files under `~/.azula` (`network-real`,
`sync-real`, `persistence-real`) and, on macOS, keys in the login Keychain
(service `app.azula.identity`, accounts `endpoint_key`/`root_secret`). With
no override, there was no way to run a second desktop instance for real
device-linking/sync testing against the live network without mutating (or
being confused with) the developer's own identity — `jvm-app-mock`'s
in-memory `FakeTransport` doesn't help here since it never touches real iroh
networking. This mirrors azula-cli's `AZULA_KEY_DIR`/`AZULA_REGISTRY_DIR`/
`AZULA_MAILBOX_LOG_DIR` overrides (`azula-cli/src/identity.rs`,
`registry.rs`) — same naming convention, same "unset means unchanged"
guarantee, so the two repos feel like one system.

Setting `AZULA_DATA_DIR=<scratch-dir>` before launching `jvm-app` redirects
**all** of its desktop state under that directory instead of `~`:

- `<scratch-dir>/.azula/…` — peers, settings, profiles, invitations, blobs,
  messages, the sync event log (everywhere the code used to read
  `~/.azula/…`)
- `<scratch-dir>/Downloads/Azula/` — exported media (was `~/Downloads/Azula/`)
- `<scratch-dir>/.azula/endpoint.key`, `<scratch-dir>/.azula/root.key` — the
  endpoint secret and root secret, as **plain files**, even on macOS

That last point is deliberate, not an oversight: redirecting only the files
would be a trap, since the app would still find (and could silently mutate)
the real identity's Keychain entries the moment the override was forgotten.
Rather than namespace the Keychain service string per override, an
`AZULA_DATA_DIR` override **bypasses the real macOS Keychain entirely** and
falls back to file-based key storage under the scratch dir. Reasoning:

- A scratch instance must be fully contained — `rm -rf $AZULA_DATA_DIR` has
  to remove *everything* it touched. A namespaced Keychain entry would
  survive that and accumulate across runs, with no directory to delete to
  clean it up.
- It never prompts for Keychain unlock/access, which a CI box or a sandboxed
  agent may not be able to satisfy at all.
- The isolation code path is identical to the existing non-macOS fallback
  (`FileSecretKeyStore`), so there's one fewer code path to trust rather than
  a new namespaced-Keychain path to get right.

Unset, behavior is byte-for-byte what it was before this override existed —
real `~/.azula`, the real Keychain on macOS — which is the property that
makes this safe to ship: a developer who never sets `AZULA_DATA_DIR` sees no
change at all. See `network-real/src@jvmAndAndroid/dev/azula/net/IrohFfiTransport.kt`
(`azulaHomeDir`, `defaultDesktopKeyStore`) and the identically-named/documented
helper duplicated in `sync-real` and `persistence-real` (separate Amper
modules, no shared internal boundary) for the implementation, and
`network-real/test@jvm/dev/azula/net/AzulaDataDirTest.kt` /
`persistence-real/test@jvm/AzulaDataDirTest.kt` /
`sync-real/test@jvm/AzulaDataDirTest.kt` for the coverage (unset parity,
override redirection, Keychain bypass, and two overrides never interfering).

To run two independent desktop instances against the real network side by
side:

```sh
AZULA_DATA_DIR=/tmp/azula-instance-a ./kotlin run -m jvm-app &
AZULA_DATA_DIR=/tmp/azula-instance-b ./kotlin run -m jvm-app &
```

Each instance mints/keeps its own endpoint identity under its own scratch dir and
neither can read, write, or collide with the other's — or with a developer's
real, unset-override `~/.azula` install.

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

## QUIC transport wiring needs real-endpoint tests (the link/0 lesson)

An in-memory duplex (`tokio::io::duplex`, Kotlin pipes) is live in both
directions the moment it exists. A real QUIC connection is not: a freshly
opened bi-stream is **not surfaced to the accepting side until the dialer
writes bytes on it** — iroh's `accept_bi()` simply doesn't resolve. No
duplex test can tell the two apart, so duplex tests are structurally blind
to stream-establishment bugs, no matter how thorough their frame-level
coverage.

Proven concretely by `azula/link/0` (multi-device-identity task 6.7,
2026-07-24): the spec had the *accepting* side send the first frame
(`LinkHello`), so over a real connection the acceptor parked in
`accept_bi()` while the dialer blocked reading a hello that could never be
sent. Device linking never worked on any real device — 3/3 hardware
attempts timed out — while every protocol unit test in both languages
stayed green. The fix (the dialer writes one priming blank line after
opening the stream; both languages' frame readers skip blanks) is
documented at `LINK_ALPN` in `azula-cli/src/link.rs`.

So the first design question for every new protocol is **"who writes
first?"**: if the accepting side is specified to speak first — or either
side's first action is a read — the protocol deadlocks over QUIC exactly
as specified. Prefer a dialer-writes-first opening (a mutual hello, like
`azula/sync/0`); otherwise mandate a priming write from the dialer, like
link/0's blank line. Close has the mirror-image hazard: a QUIC close
discards stream data still in flight, so a handler whose *last* frame
matters must wait for acknowledgement (`SendStream::finish()` +
`stopped()`) before returning — found by the rootless-link real-transport
test, where the router's close silently discarded the `LinkReject`.

**Rust (azula-cli): every ALPN gets at least one real-two-endpoint test.**
Two in-process iroh endpoints (`presets::Minimal`, no relays), a `Router`
accepting with the same handler production binds, a real dial. One "the
session completes over a real connection" smoke test per protocol; the
edge-case depth stays on the fast duplex tests. Template:
`link_handshake_completes_over_a_real_quic_connection` in `src/link.rs`;
siblings in `sync.rs`, `mailbox_role.rs`, `mcp.rs`, and `term.rs`'s
long-standing end-to-end suite.

**Kotlin (azula-app): equivalent coverage is currently impossible — so a
green `./check` is NOT sufficient evidence for a change touching the
Kotlin transport wiring.** The iroh-kmp FFI (`IrohEndpoint.bind`) exposes
no relay-free/`Minimal` preset and no direct-address connect (dialing is
ticket-only), so a two-real-endpoint Kotlin test would bind real sockets
and depend on live network/relay behaviour; no Kotlin test in the tree
binds an endpoint today, and the Android/iOS `./check` legs couldn't run
one at all. Stated plainly: **the Kotlin transport wiring's only coverage
of QUIC stream-establishment semantics is an on-device pass, so any change
touching who-writes-first, stream open/close, or ALPN wiring on the Kotlin
side requires one before it can be called verified.** This is precisely
how 6.7 — a total, every-device failure of device linking — shipped behind
a fully green two-language suite and was found only by plugging in a
phone.

If iroh-kmp later exposes a minimal/relay-free preset and direct-address
connect, Kotlin real-transport tests become feasible and this exception
shrinks away — a genuine testability improvement to that repo, worth
proposing.

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
