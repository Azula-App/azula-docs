# Architecture-Di Specification

## Purpose
Defines how `azula-app` is wired (Metro compile-time dependency injection, one
flat graph) and split into modules (the api/real feature-module convention),
so features stay isolated, testable at their `-api` seam, and buildable
without a real backend via the `-mock` apps.

## Requirements

### Requirement: Single Flat Dependency Graph
Each entry point SHALL define exactly one flat Metro `@DependencyGraph`
scoped to `AppScope`, with a `@DependencyGraph.Factory` and no nested or
child components. `AppScope` SHALL be defined in `core` so every module that
contributes bindings or declares the graph references the same scope.

#### Scenario: App entry graph
- **WHEN** a platform app module builds its dependency graph
- **THEN** it uses a single `@DependencyGraph(scope = AppScope::class)`
  interface with a `@DependencyGraph.Factory`, not multiple nested graphs

### Requirement: Constructor Injection, No Service-Locator Globals
Services SHALL be provided via constructor injection (`@Inject class`,
marked `@SingleIn(AppScope::class)` when a process singleton) and bound via
`@Binds`/`@ContributesBinding(AppScope::class)`. Global mutable
service-locator singletons (e.g. `object … Config { var … }`) SHALL NOT be
used, except the single deliberate exception of a process-wide state handle
needed to reach state outside the composition root.

#### Scenario: Process-wide handle exception
- **WHEN** Android needs a notification-tap `Intent` to reach app state
  outside Compose
- **THEN** it goes through the one documented exception (`AppStateHost.shared`),
  not a newly introduced global holder

### Requirement: Composition Root Owns Platform Wiring
The dependency graph factory SHALL be the composition root: platform-specific
implementations and runtime inputs SHALL be supplied as `@Provides` factory
parameters at the platform entry point, not resolved deeper in the graph.

#### Scenario: Android vs desktop graph construction
- **WHEN** Android builds the graph
- **THEN** it passes Context-backed implementations (transport, notifier,
  message store) into the graph factory's `create(...)` call
- **AND WHEN** a `-mock` app builds its graph
- **THEN** it calls `buildMockState()` instead, wiring `FakeTransport` and
  null stores rather than real platform implementations

### Requirement: api/real Module Split
Each feature SHALL be split into two modules: `{feature}-api` (interfaces and
wire types) and `{feature}-real` (implementations and platform code). A
module SHALL depend only on another feature's `-api`, never its `-real`.

#### Scenario: Feature dependency boundary
- **WHEN** a feature module needs another feature's functionality
- **THEN** it declares a dependency on that feature's `-api` module only
- **AND** fakes for that feature live in `mock-support`, not inside the
  `-api` module, so no fake code ships in the real app

### Requirement: Package Parity Across api/real
An api and real module pair SHALL share the same package namespace, so call
sites are unaffected by which module currently hosts a symbol. The api/real
boundary SHALL be enforced by the module graph, not by package naming.

#### Scenario: Network feature package
- **WHEN** code in either `network-api` or `network-real` declares types
- **THEN** both use the same package (`dev.azula.net`)

### Requirement: core Is the Dependency Leaf
`core` SHALL hold `AppScope` and shared pure value types, SHALL depend on
nothing else in the graph, and any other module MAY depend on it.

#### Scenario: core has no upstream dependencies
- **WHEN** `core`'s module manifest is inspected
- **THEN** it declares no dependency on any feature module

### Requirement: Assembly Confined to App Modules
Only the app-assembly modules (`shared` and the platform app modules) SHALL
depend on `-real` modules and build the dependency graph. Feature modules
SHALL NOT depend on the app modules.

#### Scenario: No back-edge to the assembler
- **WHEN** a feature module is added
- **THEN** it has no dependency edge back to `shared` or any platform app
  module

### Requirement: Fakes Bound at the api Seam for Testing
Tests SHALL bind fakes against `-api` interfaces (kept in `mock-support`)
rather than depending on platform/native implementations, so tests exercise
real logic without native bindings.

#### Scenario: Network test with FakeTransport
- **WHEN** a test exercises transport-dependent code
- **THEN** it binds `IrohTransport` to `FakeTransport` from `mock-support`
  and drives the path with no iroh native dependency

### Requirement: -mock Apps Run Real UI Over a Fake Backend
Each platform SHALL have a sibling `-mock` app that composes the real UI
against `FakeTransport`/`buildMockState()` with no real persistence or
transport, is visually distinguished from the real app (inverted icon
palette), and launches pre-seeded with demo data so it is usable immediately.

#### Scenario: Mock app state pre-install
- **WHEN** a `-mock` app starts
- **THEN** it sets the shared state handle to `buildMockState(scope)` before
  composition, so the app's state accessor returns the fake state and no
  real transport is ever created

#### Scenario: Demo peer id collision guard
- **WHEN** a new demo peer is added to the mock invitations store
- **THEN** its id SHALL be listed as a known contact (so the stranger gate
  does not close its stream) AND SHALL differ from every other demo peer id
  in the first two characters, to avoid colliding truncated sidebar labels

### Requirement: Feature Module Addition Recipe
Adding a feature module SHALL follow this sequence: create `{feature}-api`
(interfaces, value types, a fake) depending on `core`; create `{feature}-real`
(`@Inject` implementations, `@ContributesBinding(AppScope::class)` bindings)
depending on the `-api`; register both modules and depend on them from the
assembler; carve the feature's state out of the app's shared state coordinator
into a `@Inject` service behind the `-api` interface; build every app target
and keep tests green at each step.

#### Scenario: New feature module rollout
- **WHEN** a new feature module is introduced
- **THEN** each step of the recipe is completed, in order, before the change
  is considered done

### Requirement: Metro Plugin Version Pinned to Kotlin Compiler
The Metro compiler-plugin and runtime coordinates SHALL be pinned to versions
compatible with the project's Kotlin compiler version, and both SHALL be
moved together whenever the Kotlin/Amper version changes.

#### Scenario: Kotlin version bump
- **WHEN** Amper/Kotlin is upgraded
- **THEN** the Metro compiler-plugin and runtime dependency versions are
  checked against Metro's compatibility table and updated together
