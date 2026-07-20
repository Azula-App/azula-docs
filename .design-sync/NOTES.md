# design-sync notes — azula

- The repo has **no JS component library of its own** (app is Kotlin/Compose, site is
  string-template CSS). The synced package `azula-docs/design-system/` is the canonical
  web implementation, authored 2026-07-20 from the normative spec
  `azula-docs/openspec/specs/design-system/design.md` plus the A2UI catalog reference
  (Claude Design project `e03ecee7-…`, `azula - A2UI Catalog.dc.html`). Tokens are a
  derived copy — change design.md first, then `design-system/src/tokens.css`.
- The converter runs from the **parent checkout** (`/Users/sal/Developer/azula`), which is
  not itself a git repo; `.design-sync` there is a symlink to `azula-docs/.design-sync`.
  Node modules / entry: `azula-docs/design-system/node_modules`,
  `azula-docs/design-system/dist/index.es.js`. Build first: `npm run build` in
  `azula-docs/design-system`.
- **[FONT_MISSING] "Space Grotesk" is accepted, user-approved (2026-07-20):** the app and
  site deliberately do not bundle Space Grotesk (`Fonts.ui` resolves to system sans —
  design.md §11 "Accepted — not debt"). The user chose "system fallback" over bundling.
  JetBrains Mono DOES ship, copied from `azula-app/theme/composeResources/font/` into
  `design-system/fonts/` (weights 400 + 700 only — the design system uses no 500/600 mono).
- `guidelinesGlob` is `[]` on purpose: `design-system/docs/*.md` are category-frontmatter
  stubs for grouping, not design guidelines.
- Grouping: Brand / Buttons / Surfaces / Inputs / Navigation / Content via
  `design-system/docs/<Name>.md` frontmatter.
- `cfg.provider` is the package's own `Screen` component — previews need the near-black
  `appBackground` ground or everything looks wrong on white. Provider props override
  `minHeight: 0; padding: 16` so cards hug content instead of trailing a 100vh black
  expanse.
- **Fixed-overlay previews need an in-flow spacer**: Modal's preview has
  `<div style={{height: 448}} />` because the provider's `minHeight: 0` leaves the
  document a few px tall and the 640x480 `cardMode: "single"` capture crops the
  fixed-centered card. 448 + 2×16 provider padding = 480. Applies to any future
  `position: fixed` component.
- Preview-authoring notes: `TextField.onChange` passes the string (not the event);
  `Icon` exports `IconName` (import type); constrain inputs/wide pieces to ~340–520px
  wrappers or they span the whole card; Checkbox labels are sans on purpose
  (`az-check__label`).
- All Bash under `/Users/sal/Developer/azula` needs the sandbox override in this
  environment ("Operation not permitted" otherwise).

## Known render warns

- `[FONT_MISSING] "Space Grotesk"` — permanent, user-accepted (see above).

## Re-sync risks

- The package is hand-derived from `design.md` — if design.md tokens change, nothing
  breaks the build; `design-system/src/tokens.css` just silently drifts. Diff them when
  design.md moves.
- The A2UI catalog reference lives in a separate Claude Design project (`e03ecee7-…`)
  and can drift from this package; it is exploratory, the specs are normative.
- `azula-app` font TTFs are copied (not linked) into `design-system/fonts/` — re-copy if
  the app's bundled fonts ever change.
- Converter deps in `.ds-sync/` are gitignored and re-staged per clone; `typescript`
  must be `^5.x` there. TS 7.0 ships no JS compiler API at all (verified: the module
  exports only `version`/`versionMajorMinor`), so the validate script's `.d.ts` check
  and ts-morph both break — the failure is silently reported as "typescript not in
  node_modules". Checked `7.1.0-dev.20260720.1` (2026-07-20): the API returns there as a
  REDESIGNED surface under `typescript/unstable/sync` (`API`/`Project`/`Checker` handles
  into the native compiler) and `typescript/unstable/ast` — the root export stays
  version-only. So a version bump alone can never lift the pin: the design-sync scripts
  (and ts-morph) target the classic root API and would need upstream rewrites against
  the new one. Don't retry nightlies; wait for the design-sync skill to adopt it.
