---
name: store-listing-assets
description: >
  Generate on-brand app-store / marketplace listing graphics for azula on ANY
  platform — app icon, feature/promo graphic, and framed marketing screenshots —
  rendered in the neon-glass design language at each store's exact required pixel
  sizes and aspect ratios. Use when preparing or updating a store listing's
  images. Triggers: "make the Play Store / App Store listing", "generate store
  screenshots / feature graphic / app icon", "listing assets for iOS / Android /
  Chromebook", "promo graphic for the app".
license: MIT
allowed-tools:
  - Bash
  - Read
  - Write
  - Edit
---

# Store-listing assets (neon-glass)

Produce the graphics a store listing needs — **app icon**, **feature/promo
graphic**, and **marketing screenshots** — for Google Play, the Apple App Store,
or any other store, all in azula's neon-glass look and sized exactly to the
store's spec.

The screenshots are **real in-app captures framed on a branded background** with a
short headline — not raw device grabs. Framing is what lets us hit the exact
9:16 / 16:9 aspect ratios stores demand and makes the listing look promotable.

## What it produces

| Asset | What it is |
|---|---|
| App icon | The full-bleed **opaque `›a` mark** (the store applies its own rounding/mask) |
| Feature / promo graphic | Wide banner: `› azula` wordmark + tagline + a device peeking in (Play only) |
| Marketing screenshots | Real capture framed on dark `#070709` + pink glow, with a mono headline (`›` green prompt + one pink accent word) |

## Prerequisites

- **Tools:** `inkscape`, `imagemagick` (`magick`), `python3`. On macOS: `brew install inkscape imagemagick`.
- **Font:** JetBrains Mono must be installed so fontconfig finds it. Repo copies
  live at `azula-app/theme/composeResources/font/` — install them (macOS: copy the
  `.ttf` into `~/Library/Fonts/`) if `fc-list | grep -i jetbrains` is empty.
- **Sandbox:** these steps read/write under the user's home (`~/Downloads`, the
  repo). If commands fail with "Operation not permitted", re-run with the sandbox
  disabled.

## Brand source of truth (do not invent values)

- **Tokens** (bg `#070709`, pink `#FF2D9B`, green `#52C98A`, JetBrains Mono):
  [`azula-docs/docs/design-system.md`](../../../docs/design-system.md) is
  **normative** — §3 color, §7 glow/gradients, §9 brand. `Color.kt` and
  `A2uiTokens` are derived copies, as are the constants at the top of
  `scripts/gen.py`.
  Note `gen.py`'s `MUTED` is `#8a8a9a`, which the design system calls
  `contentDim` — the app's `muted`/`contentSubtle` is a *different* value
  (`#7A7A8A`). Don't reconcile them by changing the hex; the name is the bug.
- **Icon:** render from `azula-app/design/icon/icon.square.svg` — the **canonical
  `›a` mark**, full-bleed and opaque. Do **not** use the pre-rounded
  `icon.master.svg`/`master-*.png` (stores round it themselves), and ignore any
  stray dolphin / `azula_fire_a.svg` marks floating around — they are not current.
- **Source screenshots:** `azula-app/e2e/screenshots/` (`android-*.png`,
  `ios-*.png`). These come from the `-mock` / e2e build.

## How to run

```bash
# from the azula parent checkout
python3 azula-docs/.claude/skills/store-listing-assets/scripts/gen.py --platform play
# → ~/Downloads/azula-play-assets/{app-icon,feature-graphic,phone,tablet-7in,tablet-10in,chromebook}/

# for iOS: first point FEATURES' shot= at the ios-*.png captures (see "Adapting"),
# then:
python3 .../scripts/gen.py --platform appstore
```

Flags: `--platform {play|appstore|…}` (required), `--out <dir>`
(default `~/Downloads/azula-<platform>-assets`), `--repo <azula-root>`,
`--shots <dir>`, `--icon-src <svg|png>`. The script prints a **validation table**
of every output's real dimensions + file size at the end — always eyeball it.

## Adapting it (the reusable part)

Everything you tune lives at the top of `scripts/gen.py`:

1. **Copy / screenshots — `FEATURES`.** One entry == one screenshot in every
   phone/tablet group. Set `shot=` to a file in the shots dir (swap
   `android-*.png` → `ios-*.png` for iOS), `head=` (tuple alternating
   normal/ACCENT text — accents render pink), and `sub=` (pre-wrapped lines; SVG
   does not auto-wrap). **Pick clean, self-explanatory shots; avoid any with
   debug/"mock" text or blank/keyboard-covered states.**
2. **New platform — `PLATFORMS`.** Copy an entry, set `icon.size`, `feature`
   ({w,h} or `None`), and the `groups` (each: `name`, `tmpl`
   `portrait`|`landscape`, `w`, `h`). **Verify the numbers against the live store
   console** — see [`references/store-specs.md`](references/store-specs.md); stores
   change accepted sizes over time.
3. **Templates.** `portrait()` = headline on top, device below (phones).
   `landscape()` = wordmark + headline on the left, device on the right (tablets,
   Chromebook, desktop). Both auto-fit the headline to the available width and
   preserve the real screenshot's aspect ratio.

## Gotchas baked into the script (keep them)

- **`xml:space="preserve"` on headlines.** SVG collapses whitespace at
  `<tspan>` boundaries, gluing words together (`your**llm**`). The headline/wordmark
  `<text>` nodes set `xml:space="preserve"` and keep tspans tight on one line.
- **Auto-fit type.** `fit_fs()` shrinks a headline so it can't collide with the
  device on narrow canvases (JetBrains Mono advance ≈ 0.62 em/char).
- **Opaque icon.** The icon is flattened onto `#070709` (`-alpha remove`) so the
  store's mask/shadow sits on a clean edge — never ship the pre-rounded master.
- **Rendered with Inkscape**, not `magick`'s SVG delegate: only Inkscape renders
  the `feGaussianBlur` neon glows faithfully.
- **Validate before delivering.** Confirm each file's real dimensions, aspect
  ratio, and byte size against the store's limits (the script's table does this).

## Deliver

Write outputs into a single organised folder under `~/Downloads` (one subfolder
per store section, files numbered in upload order) so they map 1:1 onto the store
console's upload slots. Then flag any judgement calls to the user: the icon/brand
choice, the marketing copy (theirs to edit), and any sections that reuse the same
image (e.g. Play's 10-inch tablet and Chromebook share a size).
