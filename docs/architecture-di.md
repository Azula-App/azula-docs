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
      scope = appScope, isDemo = isDemo, transport = createTransport(),
      notifier = AndroidNotifier(this), messageStore = AndroidMessageStore(ctx), …
  ).azulaState
  // Desktop/iOS (rememberAzulaState): platform defaults, no notifier
  ```
- **Platform-specific bindings come from platform source sets** (`src@android`,
  `src@ios`, …) as `@ContributesBinding(AppScope::class)`; aggregation is
  scope/classpath-driven, so the module declaring `scope = AppScope::class` merges
  everything its dependencies contribute. (We currently pass platform impls through
  the factory; contributed bindings are the target as feature modules land.)
- **No service-locator globals.** The old `object …Config { var … }` holders and
  `AppStateHost` are gone — the graph is created once per process and owns the
  singletons.
- **Compose stays parameterized.** Composables take feature `-api` interfaces as
  params from graph accessors at the root — no member injection into UI.

## Module architecture (api/real)

- **`core`** is the dependency leaf: `AppScope` + (eventually) pure value types.
  Everything may depend on it; it depends on nothing.
- **Each feature = `{feature}-api` + `{feature}-real`.** `-api` holds interfaces,
  wire types, and fakes; `-real` holds implementations and platform code. A module
  may depend only on another feature's **`-api`**, never its `-real`.
- **Keep the same package across api/real** (e.g. both network modules are
  `dev.azula.net`). Call sites don't change when code moves modules, and the
  api/real boundary is enforced by the *module* graph, not by package names.
- **Assemble in the app modules.** `shared` (→ a thin `app`) and the platform
  app modules depend on the `-real` modules and build the graph. Feature modules
  never depend on the app.

### Worked examples in the tree
- **network** — `network-api` (`IrohTransport`/`P2pStream` interfaces, `Frame`
  protocol, `Alpns`, `FakeTransport`) + `network-real` (iroh-kmp transport, peer
  stores, `createTransport`). Nothing above the transport sees iroh-kmp.
- **terminal** — `terminal-api` (the `TermScreen` engine + `KeyBytes`), pure logic
  over Compose state. UI + `TerminalSession` land in `terminal-real`.

## Testing (mock at the api seam)

Because callers depend only on `-api` interfaces, tests bind fakes with no
platform/native deps. The network is the template — `FakeTransport` (in
`network-api`) drives the whole path with no iroh binding:

```kotlin
val transport: IrohTransport = FakeTransport()
transport.bind(listOf(Alpns.CHAT))
val stream = transport.connect("any-ticket", Alpns.CHAT)   // loopback echo
```

See `network-api/test/FakeTransportTest.kt`. Apply the same shape per feature:
put a fake in `-api`, inject it in tests (directly or via a test graph).

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

### AzulaState decomposition

`AzulaState` (was a 1105-line god-object) is now a **coordinator** that holds and
delegates to `@Inject @SingleIn(AppScope)` services, so the UI's `state.xxx`
surface is unchanged. Extracted:

- **`ConversationStore`** — shared conversation state (`conversations`/`convState`),
  lookup/create/name helpers, and the shared id generator. The foundation.
- **`SurfaceStore`** — the live A2UI `surfaces` registry (shared state).
- **`PersonaService`** — the user's personas + CRUD over `ProfileStore`.
- **`PersistenceCoordinator`** — restore/save/delete of message history.
- **`A2uiService`** — A2UI surface actions (send to peer when live, else local).
- **`ChatService`** — sending text/file messages + the canned local assistant +
  the `thinking` flag. Sends over the conversation's own stream, so it needs no
  transport reference.

What remains in the coordinator: the **connect + transport lifecycle** —
`start()`/`bind`/rebind, `connectPeer`, `wireConv`, `receiveLoop`, `reconnectSaved`,
and the `applyFrame` **frame router** that dispatches incoming frames to the
services above. This is a legitimate coordinator responsibility (something must own
the swappable `transport` and route frames). Pulling it into a `ConnectService`
(and moving the services into `connect`/`chat` api/real modules) is the final step,
but it's the app's connect/pairing core and can't be verified end-to-end without a
live peer — so it warrants a focused change with real pairing tests, not a blind
refactor. The `TerminalSession` interface (terminal-api) is the template for the
narrow UI-facing contract to give the connect UI.
