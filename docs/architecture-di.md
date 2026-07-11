# azula-app architecture: Metro DI + api/real modules

How `azula-app` is wired and split into modules. Two complementary layers:

- **Runtime DI — [Metro](https://zacsweers.github.io/metro/)**: one *flat*
  dependency graph, constructor injection, no service-locator globals.
- **Build modules — the api/real split** (per Jesse Wilson's
  ["flattening my dependency graph"](https://publicobject.com/2026/02/03/flattening-my-dependency-graph/)):
  each feature is two Amper modules, and code may depend only on other features'
  `-api`.

## Build setup (Amper, no Gradle)

Metro is a Kotlin **compiler plugin**, applied through Amper's standalone
`settings.kotlin.compilerPlugins` (Amper 0.10+). Any module that *uses* Metro
annotations **or** calls a Metro intrinsic (`createGraph`, `createGraphFactory`)
needs both the plugin and the runtime dependency:

```yaml
# module.yaml
dependencies:
  - dev.zacsweers.metro:runtime:0.13.2       # Amper won't auto-add this
settings:
  kotlin:
    compilerPlugins:
      - id: dev.zacsweers.metro.compiler
        dependency: dev.zacsweers.metro:compiler:0.13.2
```

**Version pinning is load-bearing.** Metro's compiler plugin tracks the Kotlin
compiler version. This project is on **Kotlin 2.3.21** (Amper 0.11.0 / Compose MP
1.10.3), which maps to **Metro 0.13.2** (the 0.10.x–0.13.x line supports 2.3.21;
1.0.0-RC3+ requires Kotlin 2.4.x). If you bump Amper/Kotlin, re-check Metro's
[compatibility table](https://zacsweers.github.io/metro/latest/compatibility/)
and move both the runtime and compiler coordinates together.

## Metro conventions (the flat graph)

- **One flat graph per entry point.** `@DependencyGraph(scope = AppScope::class)
  interface AppGraph` with a `@DependencyGraph.Factory`. No nested/child
  components. See `shared/src/dev/azula/di/AppGraph.kt`.
- **`AppScope` lives in `core`** (`dev.azula.core.AppScope`) so every module —
  graphs and contributed bindings alike — references the same scope.
- **Constructor injection first.** Services are `@Inject class …`, marked
  `@SingleIn(AppScope::class)` when they're process singletons (e.g. `AzulaState`).
  Bind interfaces with `@Binds` / `@ContributesBinding(AppScope::class)`.
- **The factory is the composition root.** Runtime inputs and platform impls come
  in as `@Provides` factory params — this is where the platform decides what to
  wire:
  ```kotlin
  // Android (AzulaApplication): Context-backed impls
  createGraphFactory<AppGraph.Factory>().create(
      scope = appScope, transport = createTransport(),
      notifier = AndroidNotifier(this), messageStore = AndroidMessageStore(ctx), …
  ).azulaState
  // Desktop/iOS (rememberAzulaState): platform defaults, no notifier
  // The -mock apps call buildMockState() (FakeTransport + null stores) instead.
  ```
- **Platform-specific bindings come from platform source sets** (`src@android`,
  `src@ios`, …) as `@ContributesBinding(AppScope::class)`; aggregation is
  scope/classpath-driven, so the module declaring `scope = AppScope::class` merges
  everything its dependencies contribute. (We currently pass platform impls through
  the factory; contributed bindings are the target as feature modules land.)
- **No service-locator globals for dependencies.** The old `object …Config { var … }`
  holders are gone — the graph is created once per process and owns the
  singletons. The one deliberate exception is `AppStateHost.shared`
  (`shared/src/dev/azula/state/AppEntry.kt`): a process-wide handle to the built
  `AzulaState`, needed on Android so a notification-tap `Intent` can reach state
  outside Compose; the `-mock` apps also use it to pre-install the fake state.
- **Compose stays parameterized.** Composables take feature `-api` interfaces as
  params from graph accessors at the root — no member injection into UI.

## Module architecture (api/real)

- **`core`** is the dependency leaf: `AppScope` + (eventually) pure value types.
  Everything may depend on it; it depends on nothing.
- **Each feature = `{feature}-api` + `{feature}-real`.** `-api` holds interfaces
  and wire types; `-real` holds implementations and platform code. A module may
  depend only on another feature's **`-api`**, never its `-real`. (Fakes live in
  `mock-support`, not in `-api`, so no fake code ships in the real app.)
- **Keep the same package across api/real** (e.g. both network modules are
  `dev.azula.net`). Call sites don't change when code moves modules, and the
  api/real boundary is enforced by the *module* graph, not by package names.
- **Assemble in the app modules.** `shared` (→ a thin `app`) and the platform
  app modules depend on the `-real` modules and build the graph. Feature modules
  never depend on the app.

### Worked examples in the tree
- **network** — `network-api` (`IrohTransport`/`P2pStream` interfaces, `Frame`
  protocol, `Alpns`) + `network-real` (iroh-kmp transport, peer stores,
  `createTransport`). Nothing above the transport sees iroh-kmp.
- **terminal** — `terminal-api` (the `TerminalEmulator` engine, `PredictionEngine`,
  `KeyBytes`, and the `TerminalSession` contract), pure logic over Compose state.
  The terminal UI + real session implementations live in `terminal-real`. See
  [`terminal.md`](terminal.md).
- **mock-support** — the fakes kept out of the real app: `FakeTransport` (fake
  network + terminal + chat loopback) and `buildMockState()`. Depended on only by
  the `-mock` apps.

## Testing (mock at the api seam)

Because callers depend only on `-api` interfaces, tests bind fakes with no
platform/native deps. The network is the template — `FakeTransport` (in
`mock-support`) drives the whole path with no iroh binding:

```kotlin
val transport: IrohTransport = FakeTransport()
transport.bind(listOf(Alpns.CHAT))
val stream = transport.connect("any-ticket", Alpns.CHAT)   // loopback echo
```

See `mock-support/test/FakeTransportTest.kt`. Apply the same shape per feature:
put a fake in `mock-support`, inject it in tests (directly or via a test graph).

## The `-mock` apps (real UI, fake backend)

Each platform has a sibling `-mock` app — `android-app-mock`, `jvm-app-mock`,
`ios-app-mock` — that runs the *real* UI over `FakeTransport` and no real
persistence, so the fakes never touch the shipping app. Each pre-installs
`AppStateHost.shared = buildMockState(scope)` (from `mock-support`) before the
composition, so `rememberAzulaState()` returns it and the real transport is never
created. Android's mock uses a separate `applicationId` (`app.azula.mock`) so it
installs alongside the real app, and has no foreground service / notifier / iroh
dep. The Maestro flows in `e2e/` drive these `-mock` apps.

**They wear an inverted icon.** The real mark (green `›` + magenta `a`) on a
near-white `#f8f8f6` ground instead of the brand's near-black, so the mock build
is tellable apart from the real one at a glance in a launcher or dock — Android's
mock previously had *no* icon at all and shipped as the default robot. The masters
are never forked: `design/icon/generate.sh` renders the same four SVGs a second
time through an `invert` palette substitution, so the geometry cannot drift. The
desktop asset lives in `mock-support/composeResources` (`mockAppIconPainter()`),
not `shared/`, so it never ships inside the real app.

**They launch populated.** `buildMockState` binds a `SeededMessageStore`
(`mock-support/src/dev/azula/mock/MockSeed.kt`) — a read-only `MessageStore` of
`ConversationDto` fixtures. `PersistenceCoordinator.restoreAll` walks it exactly
as it would a real on-disk store, so seeding it builds the sidebar rows *and* each
conversation's history with no changes anywhere in the UI or state layer. That is
the place to add or edit demo chats. Terminals can't come from that path
(scrollback isn't persisted, and `terminalDispatcher` is `internal` to
`dev.azula.state`), so `FakeTransport.incoming()` surfaces them instead: always
`mockterm` (an interactive echo shell) and, when `FakeTransport(demoTerminal =
true)` — which only `buildMockState` passes — a second `buildbot` replaying a
canned build transcript. The flag exists because the test suites share this
transport and shouldn't have to disambiguate a terminal they never asked for.

Two traps worth knowing before adding another demo peer. Its id must be listed as
a contact in `MockInvitationsStore`, or ConnectService's stranger gate closes the
stream outright ([`invitations.md`](invitations.md)). And its id must differ from
the others **in the first two characters**: an un-announced peer's row is labelled
`<first 2 chars> · word · word` by `ConversationStore.mnemonicCode` and then
*truncated* by the sidebar, so `mockterm` and `mockbuild` render as the same
`mo · onyx · …` row — as, visibly, would `mockcargo`. Hence `buildbot`.

## Adding a feature module (recipe)

1. `{feature}-api`: interfaces + value types + a fake. `module.yaml` deps: `core`
   (+ serialization/coroutines/compose as needed).
2. `{feature}-real`: `@Inject` impls (+ platform source sets), `@ContributesBinding
   (AppScope::class)` for the bindings, Metro plugin + runtime. Deps: the `-api`.
3. Register both in `project.yaml`; depend on them (exported) from the assembler.
4. Carve the feature's slice out of `AzulaState` into a `@Inject` service behind
   the `-api` interface; the UI takes that interface, not `AzulaState`.
5. Build every app target + run tests; keep the app green each step.

## Current module map

Foundation leaves: `core` (AppScope + value types) · `theme` · `ui-common` (image
utils) · `markdown` · `link` · `a2ui`.

Feature modules (api/real): `network-api`/`network-real` · `terminal-api`/
`terminal-real` · `persistence-api`/`persistence-real` · `notification-api`.

Assembly: `shared` hosts `AppGraph` + `AzulaState` and the remaining UI
(`Chat`/`Connect`/`Sidebar`/`Settings`/`App`) + the `Message`↔DTO mappers;
`android-app`/`jvm-app`/`ios-app` are the platform assemblers.

### AzulaState decomposition — complete

`AzulaState` (was a 1105-line god-object) is now a **thin coordinator** that holds
and delegates to nine `@Inject @SingleIn(AppScope)` services, so the UI's
`state.xxx` surface is unchanged. What it still owns is app-shell only: navigation
(`desktopActive`/`mScreen`/`mActive`), the foreground flag, and the
`TerminalSession` implementation — plus the delegating facade.

Shared state:
- **`ConversationStore`** — `conversations`/`convState`, lookup/create/name
  helpers, and the shared id generator. The foundation.
- **`SurfaceStore`** — the live A2UI surface registry.

Feature services:
- **`PersonaService`** — the user's personas + CRUD over `ProfileStore`.
- **`PersistenceCoordinator`** — restore/save/delete of message history.
- **`A2uiService`** — A2UI surface actions.
- **`ChatService`** — text/file sends + `thinking` (sends over the
  conversation's own stream, so it needs no transport reference).
- **`MediaService`** — the media-attachment lifecycle: blob-backed send/offer,
  the resumable `azula/media/0` fetch protocol (both sides), auto-download
  policy, blob read helpers for the UI, and auto-export of received media to
  user-visible device storage (the nullable `MediaExporter` seam). See
  [`media-transfer.md`](media-transfer.md).
- **`FrameDispatcher`** — the inbound-frame reaction core: `applyFrame` (fanning
  Chat/Term/Thinking/A2ui/Token frames to ChatService/terminal/SurfaceStore),
  `applyProfile`, the peer-profile share handshake, and notification posting.
  Its `foreground` hook is set by AzulaState via a callback.
- **`ConnectService`** — the connect + transport core: owns the rebindable
  `transport`, the dial/holepunch flow, silent reconnect, the inbound accept
  loop, the `receiveLoop` (reads frames off the wire and hands them to
  FrameDispatcher), rtt polling, recovery-phrase export/import, and the connect
  UI state. Its `onNavigate` hook is set by AzulaState via a callback to avoid
  a circular graph binding. Depends one-directionally on FrameDispatcher.

These services are **internal** (not api/real feature modules): unlike `network`
and `terminal`, they have no platform impls or UI-facing contract to split on —
they're the coordinator's collaborators, so they live with `AppGraph` in the
assembler. Verified end-to-end: real pairing against a live peer works through the
refactored `ConnectService` dispatcher (drove a deeplink connect on-device; the
peer registered the connection).
