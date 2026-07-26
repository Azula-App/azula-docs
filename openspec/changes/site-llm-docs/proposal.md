## Why

azula.app was a hand-rolled Cloudflare Worker: every page a template literal in
`src/pages.ts`, routed by a chain of `if`s in `src/index.ts`. Two problems had
been accumulating behind that.

**Nothing on the site explains how to use azula.** Everything about installing
the CLI, wiring up MCP, or what `azula run --handoff on-error` does lives in
`azula-cli/README.md` on GitHub, and the site never even linked to the repos. A
landing page with three cards is the whole public documentation surface.

**Nothing on the site is addressed to a machine.** azula's own pitch is that an
LLM can drive your devices — but an agent sent to azula.app gets HTML with
styling and store buttons in it, and no way to ask for the content alone. There
is no `/llms.txt`, no Markdown form of any page, and no way for a crawler to
discover either.

Writing documentation as more escaped HTML inside TypeScript template literals
was not a serious option, and neither was maintaining a hand-written Markdown
copy of each page beside it — a second copy of the privacy policy is a second
copy that goes stale, and that page is a legal claim.

## What Changes

- Rebuild the site on **Astro 7** with `@astrojs/cloudflare`, static by default,
  with `prerender = false` only on the routes that need a request. Every
  existing route keeps its behaviour, status codes and content types.
- Author prose as **Markdown content collections**, so one file is both the
  rendered page and the Markdown a machine fetches.
- Add the **`.md` twin** convention: every page is available at its own path
  plus `.md`, advertised by `<link rel="alternate" type="text/markdown">` and a
  "view as markdown" control in the page header.
- Add **`/llms.txt`** (the llmstxt.org index, generated from the collections, so
  a new page cannot be left out) and **`/llms-full.txt`** (the whole site as one
  document).
- Add a **`/docs` section** covering installation, the CLI command surface, the
  MCP setup, the URL/deeplink scheme, and the repositories — with the CLI's
  package channels marked as live from the first tagged release.
- Turn the "loads nothing but itself" claim into an **enforced** invariant: a
  `default-src 'self'` Content-Security-Policy on every page, plus a post-build
  check over `dist/` that fails CI on any off-origin resource.

Not in scope: `Accept: text/markdown` content negotiation on the HTML routes
(it would push every doc page onto the Worker for no gain over `.md` siblings),
and any change to the invite/link payload formats.

## Capabilities

### New Capabilities

- `site`: azula.app's own behaviour has never been specified — the deeplink
  contract in `deeplinks` covers the association files and how a link opens the
  app, but not what the site serves, or the machine-readable surface added
  here. This adds that.

### Modified Capabilities

(none — `deeplinks` requirements are satisfied identically; the AASA and
`assetlinks.json` remain unredirected `application/json`, now served by Astro
endpoints rather than a hand-written router.)

## Impact

- `azula-site` — rebuilt: `src/pages/**` (Astro pages and endpoints),
  `src/content/**` (Markdown), `src/lib/**` (`links.ts` and `wellknown.ts`
  move unchanged; new `llms.ts`, `content.ts`, `http.ts`, `mcp.ts`),
  `astro.config.mjs`, `wrangler.jsonc`, `scripts/check-build.mjs`. `pages.ts`,
  `index.ts` and `icon.ts` are deleted; the icons become real files in
  `public/`.
- **Deploy pipeline** — the Cloudflare Workers Builds configuration (dashboard,
  not this repo) must run a build before deploying. `main` is live, so this has
  to be confirmed before the branch merges.
- `azula-cli/README.md` stays the source of record for CLI behaviour; the docs
  pages are derived from it and from `specs/cli-surface` / `specs/mcp-bridge`,
  and will drift if those change without a pass over `/docs`.
