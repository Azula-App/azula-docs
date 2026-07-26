## 1. Astro project

- [x] 1.1 Install `astro@7` + `@astrojs/cloudflare@14`; write `astro.config.mjs`
      (adapter, `site`, `trailingSlash: never`, `build.format: file`).
- [x] 1.2 Point `wrangler.jsonc` at `@astrojs/cloudflare/entrypoints/server`
      with an `assets` binding, `nodejs_compat`, keeping the existing routes.
- [x] 1.3 Disable the adapter's default KV session store — this site has no
      session state and should not auto-provision a KV namespace on deploy.
- [x] 1.4 `npm` scripts: `dev`/`build`/`preview`/`typecheck` (`astro check`)/
      `test`/`verify`/`deploy`. Drop `@cloudflare/workers-types` (Astro's types
      cover it) and move wrangler to a version with no advisories.

## 2. Route parity

- [x] 2.1 Move `links.ts` and `wellknown.ts` to `src/lib/` unchanged, with
      their tests.
- [x] 2.2 Decode `icon.ts`'s base64 into `public/favicon.svg` and
      `public/apple-touch-icon.png`; delete the module.
- [x] 2.3 Port `/`, `/privacy`, `/404`, `/health`.
- [x] 2.4 Port `/i/[payload]`, `/s/[token]`, `/connect/[token]`, `/l/[payload]`
      as on-demand pages, preserving the 404-on-invalid behaviour, the
      custom-scheme redirect, and the invite expiry countdown.
- [x] 2.5 Port `/mcp` and `/mcp/[...rest]`, including the JSON-RPC 501 on POST
      and the deprecation note on a token path.
- [x] 2.6 Serve the two `.well-known` files as on-demand endpoints so the
      content type stays explicit and unredirected.
- [x] 2.7 Middleware applying the security headers and HTML charset to every
      Worker-rendered response; `public/_headers` for the static ones.
- [x] 2.8 Turn off Astro's cross-origin POST guard — no forms, no cookies, and
      it would otherwise answer `POST /mcp` with a 403 instead of the
      JSON-RPC error.

## 3. Content

- [x] 3.1 `src/content.config.ts` with a `docs` collection (title,
      description, order) and a `pages` collection.
- [x] 3.2 Retype `/privacy` into Markdown verbatim; the page renders that file.
- [x] 3.3 Write `/docs`: overview, install, cli, mcp, links, source.
- [x] 3.4 Landing page keeps its design, gains docs navigation and a source
      section; the CSS moves from a template literal to a stylesheet.

## 4. Machine-readable surface

- [x] 4.1 `src/lib/llms.ts` — pure builders for the Markdown document, the
      llms.txt index, and llms-full.txt.
- [x] 4.2 One catch-all endpoint generating every page's `.md` twin.
- [x] 4.3 `/llms.txt` and `/llms-full.txt` endpoints over the collections.
- [x] 4.4 `rel="alternate"` in every page head, plus the "view as markdown" /
      "copy page" control.
- [x] 4.5 CSP with `default-src 'self'` and hashed inline scripts; no
      `unsafe-inline`.

## 5. Verification

- [x] 5.1 Unit tests for the llms builders and the `/mcp` payloads; the privacy
      disclosures re-pinned against the Markdown source.
- [x] 5.2 `scripts/check-build.mjs` — Markdown twins exist and are indexed, CSP
      present, no off-origin resources in built HTML or CSS.
- [x] 5.3 CI runs typecheck, tests, build, and the build checks.
- [x] 5.4 Route sweep against `wrangler dev` on the built output: status codes
      and content types match the pre-migration Worker for every route.
- [x] 5.5 Update `azula-site/URLS.md` — route table, build model, and the
      Workers Builds requirement.

## 6. Deploy

- [ ] 6.1 **Needs Sal:** confirm the Cloudflare Workers Builds configuration
      runs `npm run build` before `wrangler deploy`. `main` auto-deploys, so
      this has to be right before the branch merges.
- [ ] 6.2 Merge to `main` and confirm the live site: `/llms.txt`, a `.md` twin,
      the AASA content type, and one deeplink round-trip from a phone.
