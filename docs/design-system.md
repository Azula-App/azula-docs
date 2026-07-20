# azula design system — "neon glass"

**This page is normative for design tokens.** Where code and this page disagree,
this page is the intent and the code is the bug. Every other place tokens are
written down — `theme/.../Color.kt`, `A2uiTokens.kt`, `azula-site/src/pages.ts`,
`azula-site/src/icon.ts`, `store-listing-assets/scripts/gen.py`,
`azula-app/design/icon/*.svg` — is a **derived copy** and cites this page.

[`docs/a2ui.md`](a2ui.md) owns the agent-facing A2UI component contract and links
here for tokens; it no longer carries its own token table.

The visual reference is the Claude Design project `azula - A2UI Catalog`
(project `e03ecee7-…`, files `azula - A2UI Catalog.dc.html`, `azula - Icon Set.dc.html`).

---

## 1. The look, in one paragraph

Near-black ground, a single hot-magenta accent, hairline borders, and light that
comes from the accent rather than from above. There is **no blur** anywhere —
"glass" is achieved with a translucent fill, a 1px semi-transparent border, and a
rounded clip. Depth is a magenta *glow* (`0 0 Npx`, never offset), not a drop
shadow. Monospace is the default voice for anything machine-adjacent; the sans is
for prose. Terminal green is reserved for output and the brand prompt. The system
is **dark-only and deliberately so** — several values encode darkness directly.

---

## 2. Naming

Semantic names, not positional ramps. `surface`, not `bg1`. The name says what a
value is *for*, so call sites read clearly and the palette can be re-pointed.

Three schemes exist in code today (`bg0/bg1/bg2`, `bg/surface/surfaceAlt`,
`--bg0/--bg1/--bg2`) over one consistent palette. That is the single largest
source of confusion in the codebase: **the same word means different hexes in
different layers.** `muted` is `#7A7A8A` in `A2uiTokens` but `#8a8a9a` in
`gen.py`. Both hexes are legitimate palette members — the *name* is the bug.

Section 10 maps every current name to its canonical one.

---

## 3. Color

### 3.1 Surfaces

| Token | Hex | Use |
|---|---|---|
| `bg` | `#070709` | App base. Also code-block fill and the icon ground. |
| `bgSunken` | `#08080D` | Recessed areas — desktop sidebar. |
| `bgWash` | `#120A18` | Gradient top stop only. Never a flat fill. |
| `surface` | `#0A0A10` | Default container/panel. |
| `surfaceSubtle` | `#0C0C13` | Pane gradient stop; web cards. |
| `surfaceRaised` | `#0D0D15` | Raised card (A2UI `Card`). |
| `surfaceInput` | `#15151D` | Text-field and input fill. |
| `surfaceMessage` | `#15151F` | Incoming message bubble. |

> `surface`, `surfaceSubtle` and `surfaceRaised` differ by ~2 points of
> luminance. They are near-indistinguishable in isolation and only read as
> distinct when adjacent. See §11 — these are consolidation candidates.

### 3.2 Outlines

A 5-step hairline ramp. Always `1px` / `1.dp`.

| Token | Hex | Use |
|---|---|---|
| `outlineFaint` | `#1B1B24` | Barely-there separation. |
| `outlineSubtle` | `#1D1D26` | Web card borders, footer rule. |
| `outlineSoft` | `#23232E` | Default hairline. |
| `outline` | `#26262F` | Standard control border. |
| `outlineStrong` | `#2A2A36` | Emphasized / nested-card border. |

### 3.3 Brand accent

| Token | Hex | Use |
|---|---|---|
| `primary` | `#FF2D9B` | The brand. Accent, active state, the `a` in the mark. |
| `primaryLight` | `#FF6EC7` | Links, borderless button text, active tab label. |
| `primaryDark` | `#C4156E` | Gradient end stop only. |
| `primaryDeep` | `#7A1850` | Glyph-gradient end stop only. |
| `onPrimary` | `#FFFFFF` | Ink on a **gradient** primary fill. |
| `onPrimaryInk` | `#0A0A0F` | Ink on a **flat** primary fill — checkbox ticks, the 16px favicon. |

`onPrimary` vs `onPrimaryInk` is a real distinction, not a drift: white reads on
the pink→pinkDark gradient, near-black reads on flat `#FF2D9B`.

### 3.4 Translucent accent

The app's "selected / active" idiom. Currently **six unnamed alpha variants** are
scattered across call sites (8/10/12/20/30/40/60%) plus an unused
`A2uiTokens.selectionFill` at 14%. Canonical scale is four steps:

| Token | Value | Compose | Use |
|---|---|---|---|
| `primaryWash` | `primary` @ 8% | `0x14FF2D9B` | Subtle row highlight. |
| `primarySelected` | `primary` @ 14% | `0x24FF2D9B` | Selected row/chip fill. |
| `primaryGlowFill` | `primary` @ 20% | `0x33FF2D9B` | Glow-halo fill. |
| `primaryEdge` | `primary` @ 40% | `0x66FF2D9B` | Default border on any of the above. |
| `primaryEdgeStrong` | `primary` @ 60% | `0x99FF2D9B` | Border on the **active/selected** item where it must out-rank `primaryEdge`. |

Fold existing values: 10% → `primaryWash`, 12% → `primarySelected`,
30% → `primaryEdge`.

> `primaryEdgeStrong` exists because `Sidebar.kt:161` uses 60% and 40%
> *contrastively* — `if (active) 0x99… else 0x66…`. Folding both to one step would
> compile fine and silently erase the active-state emphasis. **When collapsing a
> token scale, check whether any single call site uses two of the values to mean
> different things**; a frequency count alone will not tell you.

### 3.5 Content (text)

| Token | Hex | Use |
|---|---|---|
| `contentBright` | `#F3EEF1` | Warm white. Headings near pink; the A2UI catalog's brightest. |
| `contentStrong` | `#F0F0F6` | Cool white. Web headings. |
| `contentHigh` | `#E6E6EE` | Emphasized body, input text. |
| `content` | `#D6D6E0` | **Default body text.** |
| `contentMuted` | `#9A9AAA` | Secondary text. |
| `contentDim` | `#8A8A9A` | Tertiary / helper text. |
| `contentSubtle` | `#7A7A8A` | A2UI captions. |
| `contentFaint` | `#6A6A7A` | Micro-labels, timestamps. |
| `contentFaintest` | `#5A5A6A` | Disabled, watermark. |

> Nine steps is too many — five of them (`#9A9AAA` … `#5A5A6A`) are within 0.1
> of each other in relative luminance and are chosen ad hoc at call sites. See §11.

**Contrast on `bg` (`#070709`)** — measured, not estimated:

| Token | Ratio | Verdict |
|---|---|---|
| `content` | 13.9:1 | AAA |
| `contentDim` | 5.9:1 | AA |
| `contentSubtle` | 4.8:1 | AA (just clears 4.5) |
| `contentFaint` | 3.8:1 | **Fails AA.** Large text / UI only. |
| `contentFaintest` | 3.0:1 | **Fails everything.** Decorative only. |

`contentSubtle` is the floor for body text. `contentFaintest` fails even the 3:1
UI-component minimum; treat it as decorative and never put information in it.

**`contentFaint` is capped at >12sp.** It was being used for 10–11sp micro-labels
and timestamps, below the large-text threshold and genuinely unreadable for
low-vision users. Those call sites now use `contentDim`. In the app this is
enforced by two tokens: `A2uiTokens.mutedFaint` (`contentFaint`, >12sp only) and
`A2uiTokens.mutedSmall` (`contentDim`, ≤12sp). **Pick by size, not by vibe** — if
the text is 12sp or smaller, `mutedFaint` is a contrast bug.

### 3.6 Status

| Token | Hex | Use |
|---|---|---|
| `success` | `#52C98A` | Online, connected, confirmed. Also the brand `›` prompt. |
| `successBright` | `#00FF9C` | Live/active pulse only. |
| `warning` | `#FFD23F` | Degraded, relay fallback, expiring. |
| `danger` | `#FF6B6B` | Error, disconnect, destructive. |
| `accent` | `#3FC8FF` | Informational cyan. Rare — never compete with `primary`. |

`success` and the brand prompt glyph share `#52C98A` intentionally: "connected"
and "the prompt is live" are the same idea. Reference it as `success` in UI code
and `brandPrompt` in brand/icon assets — same value, different intent.

### 3.7 Terminal

| Token | Hex | Use |
|---|---|---|
| `termText` | `#9EFFC4` | Terminal output text. |
| `termPrompt` | `#52C98A` | Terminal user prompt (= `success`). |

### 3.8 Non-brand

macOS traffic lights are **literal OS chrome, not brand** — never re-theme:
`macRed #FF5F57`, `macYellow #FEBC2E`, `macGreen #28C840`.

Decorative gradient stops used only by the A2UI renderer: `trackIdle #2F2F3C`,
`pinkFaint #241028`, `blueFaint #0D1A24`, `videoTop #160B22`, `videoBottom #0A0F1A`.

### 3.9 Scrims

| Token | Value | Use |
|---|---|---|
| `scrim` | `#000000` @ 60% | Sheets, pickers. |
| `scrimHeavy` | `#000000` @ 90% | Full-screen media overlay. |

Three unrelated opacities exist today (70%/90%/60%). Fold to these two.

---

## 4. Typography

### 4.1 Families

| Token | Stack | Status |
|---|---|---|
| `mono` | `JetBrains Mono` → `ui-monospace, SFMono-Regular, Menlo, Consolas, monospace` | **Bundled** in the app. |
| `ui` | `Space Grotesk` → `system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif` | **Not bundled** — currently system sans everywhere. |

`vt323` and `pixel` are declared in `Type.kt` but map to `FontFamily.Monospace`.
They are **not part of this system** — either bundle them for a named purpose or
delete them.

### 4.2 Which family, when

Mono is used **107×** vs the sans **68×** in the app. That is not an accident and
should be stated as a rule:

- **`mono`** — anything machine-adjacent: metrics, latency, IDs, peer names, share
  codes, status labels, timestamps, terminal, code, section eyebrows, the wordmark.
- **`ui`** — prose: body copy, headings, descriptions, marketing text, message
  content.

When in doubt for a *value*, use mono. For a *sentence*, use `ui`.

### 4.3 Scale

One ramp, shared. The app uses the lower half (dense UI); the web uses the upper
half (marketing). Web values are `px`, app values are `sp`.

| Step | Size | Line height | Typical use |
|---|---|---|---|
| `micro` | 10 | 14 | Badges, icon captions. |
| `caption` | 11 | 15 | Labels, metrics, eyebrows. *Most-used size in the app.* |
| `bodySm` | 12 | 17 | Dense secondary text. |
| `body` | 13 | 18 | **Default.** |
| `bodyLg` | 14 | 20 | Comfortable body; web small print. |
| `title` | 16 | 22 | Card titles, section headings. |
| `heading` | 20 | 26 | Screen/page headings. |
| `display` | 24 | 32 | Large headings. |
| `displayLg` | 30 | 36 | Web brand wordmark. |
| `displayXl` | 40 | 46 | Web hero. |

Retire the half-pixel sizes (`13.5`, `12.5`) and the one-off `9/15/17/18/19/22/26`
by folding to the nearest step.

### 4.4 Weight and tracking

- Weights: **400** body, **600** emphasis/labels/buttons, **700** brand and headings.
  (500 exists in the loaded font but is unused — don't introduce it.)
- Tracking: `-1px` on the large wordmark, `-0.5px` on the small wordmark,
  `+1px` on mono eyebrows, `+0.6px` on uppercase table headers. Body text: none.
- Uppercase is reserved for eyebrows and table headers, always mono, always tracked.

---

## 5. Spacing

No scale exists today — **538 inline `.dp` literals** in the app, raw `px`
throughout the site. The values cluster into a de-facto continuous ramp
(6/7/8/9/10/11/12/13/14) that wants to collapse.

| Token | Value |
|---|---|
| `s2` | 2 |
| `s4` | 4 |
| `s6` | 6 |
| `s8` | 8 |
| `s10` | 10 |
| `s12` | 12 |
| `s16` | 16 |
| `s20` | 20 |
| `s24` | 24 |
| `s32` | 32 |
| `s48` | 48 |

Fold: 7 → `s6`/`s8`, 9 → `s8`/`s10`, 11 → `s10`/`s12`, 13 → `s12`, 14 → `s16`,
18 → `s16`/`s20`, 22 → `s20`/`s24`, 26 → `s24`, 30 → `s32`, 40/46 → `s48`.

Borders are always `1` and are not part of the spacing scale.

---

## 6. Radius

The current app tokens (`rSm 7 · rMd 9 · rLg 12 · rXl 16`) have **drifted from
practice** — the three most-used radii (10dp ×22, 11dp ×10, 13dp ×5) are not in
the scale at all. Canonical scale re-centres on actual usage:

| Token | Value | Use |
|---|---|---|
| `rXs` | 5 | Inline code, blockquotes, tiny marks. Absorbs 4 and 6. |
| `rSm` | 8 | Small controls, chips, keycaps. **(was 7)** |
| `rMd` | 10 | **Buttons, inputs, list rows.** (was 9) |
| `rLg` | 13 | Cards, code boxes. (was 12) |
| `rXl` | 16 | Modals, sheets. |
| `rPill` | 999 / 50% | Chips, pills, avatars, status dots. |

> `rSm` moved 7→8 after migration exposed the gap: `8.dp` was used at **10** sites
> and `7.dp` at only **3**, but the original token was 7, so ten call sites had no
> token to migrate to. Same failure as the pre-existing scale — the token was
> chosen from a prior token rather than from usage. **When a migration leaves a
> cluster of unmapped literals, suspect the scale before the call sites.**

Chat-only asymmetric bubbles ride alongside and are not general-purpose:
`rBubbleMe` = 15/15/5/15, `rBubbleThem` = 15/15/15/5.

**Icon radii are a separate, proportional ramp** — see §9.

---

## 7. Elevation, glow and gradients

### 7.1 Glow — the signature

Always `0 0 Npx` with **no offset**. Light comes from the accent, not from above.

| Token | Value |
|---|---|
| `glowSm` | `0 0 8px rgba(255,45,155,.40)` |
| `glowMd` | `0 0 14px rgba(255,45,155,.35)` |
| `glowLg` | `0 0 18px rgba(255,45,155,.40)` |
| `glowXl` | `0 0 26px rgba(255,45,155,.60)` |
| `glowGreen` | `0 0 12px rgba(82,201,138,.40)` |

In Compose, glow is a colored shadow:
`shadow(10.dp, rMd, spotColor = primary, ambientColor = primary)`.

### 7.2 Neutral shadow

Used sparingly, only where a surface genuinely floats:

| Token | Value | Use |
|---|---|---|
| `shadowCard` | `0 8px 26px rgba(0,0,0,.35)` | Raised card. |
| `shadowModal` | `0 30px 70px rgba(0,0,0,.60)` | Modal, paired with `glowXl`. |

### 7.3 Gradients

| Token | Value |
|---|---|
| `primaryBrush` | `linear-gradient(135deg, primary, primaryDark)` — primary buttons |
| `glyphBrush` | `linear-gradient(primary, primaryDeep)` — glyph/avatar fills |
| `appBackground` | `radial-gradient(120% 80% at 50% -10%, bgWash, bg)` |

`appBackground` is the **app-root wash**. Panes currently override it with
`verticalGradient(surfaceSubtle, surface)` in five places, which visibly cancels
the root wash — see §11.

### 7.4 Scanlines

The subtle CRT texture on icons and marketing assets:

```
repeating-linear-gradient(to bottom, rgba(255,255,255,.018) 0 1px, transparent 1px 3px)
```

`gen.py` uses `0.014` in a 4×3 pattern — a genuine drift. Canonical is `.018` at
1px/3px.

### 7.5 Surface recipes

An audit of all 39 hand-rolled surfaces in the app found **three distinct
recipes**, not one. An earlier draft of this page called them all "the glass-card
pattern"; that was wrong, and it matters — a single `Card` primitive would not
have fit any of them.

| Recipe | Fill | Border | Extension |
|---|---|---|---|
| **Raised card** | `surfaceRaised` | `outlineSoft` | `Modifier.azulaCard(nested, shape)` |
| **Input surface** | `surfaceInput` | `outline` | `Modifier.azulaInputSurface(shape)` |
| **Muted panel** | `surfaceSubtle` | `outlineSubtle` | `Modifier.azulaMutedPanel(shape)` |
| **Primary button** | `primaryBrush` + glow | — | `Modifier.azulaButtonSurface(variant, shape)` |
| **Glow halo** | `primaryGlowFill`→`primaryWash` | `primaryEdge` | `Modifier.azulaGlowHalo(shape)` |

A site qualifies for a recipe only if fill, border **and** paint order all match. A
surface with the right colors but no border, or with modifiers interleaved between
`clip`/`background`/`border`, is not the recipe — migrating it would change how it
paints. Several sites were skipped on exactly those grounds.

Implemented in `azula-app/theme/.../Modifiers.kt` as `Modifier` extensions rather
than wrapper composables, because the reusable part is the modifier chain — the
A2UI `Render*` functions are `private` and take JSON descriptors, so only their
styling was ever extractable, and an extension migrates a call site in one line.

Two further groups are deliberately **not** recipes: selectable chips (transparent
↔ `primarySelected`, which are stateful components rather than surfaces) and
genuinely bespoke fills (message bubbles with their asymmetric shape and gradient;
`QrView`'s intentionally white card, which must stay white for scan contrast).

---

## 8. Motion

Motion is nearly absent today: the app has no transitions, the site has **zero**
`transition` declarations and no hover or focus states at all. That is a gap, not
a style. Baseline:

| Token | Value |
|---|---|
| `durFast` | 120ms — hover, focus ring, color change |
| `durBase` | 180ms — expand/collapse, chip toggle |
| `durSlow` | 240ms — sheet, modal, pane transition |
| `easeStandard` | `cubic-bezier(.2,.8,.2,1)` |

### The cursor blink

The one existing animation, and a brand element rather than a UI affordance:

```css
@keyframes blink { 0%,49% { opacity:1 } 50%,100% { opacity:0 } }
animation: blink 1.05s steps(1) infinite;
```

`steps(1)` is required — the cursor snaps, it never fades.

**Accessibility gap:** the blink has no `prefers-reduced-motion` guard anywhere.
It should:

```css
@media (prefers-reduced-motion: reduce) { .cursor { animation: none } }
```

**Focus states are entirely missing** on the site — no `:focus-visible` rule
exists. Any keyboard user is currently navigating blind. The intended treatment
is a `primaryEdge` 1px ring at `rMd`.

---

## 9. Brand

### 9.1 The mark

Green `›` prompt + magenta `a`, both **JetBrains Mono 700**, on `bg`. The read is
"a terminal prompt", and it is the whole identity — wordmark, app icon and
favicon are all the same construction at different crops.

Canonical source: `azula-app/design/icon/icon.square.svg` — full-bleed and
opaque. **Do not** use `icon.master.svg` (pre-rounded; stores round it
themselves). Any stray dolphin or `azula_fire_a.svg` mark is **deprecated**.

Construction at 1024:

- `›` — `success`, font-size 392, `feGaussianBlur stdDeviation="20"` @ opacity 0.45
- `a` — `primary`, font-size 437, `feGaussianBlur stdDeviation="26"` @ opacity 0.60
- Ground `bg`, plus a `primary` radial depth wash @ 0.10 and the §7.4 scanlines
- The `a` is set ~11% larger than the `›` and they sit on a shared baseline

**Icon corner radius is proportional: ~22.5% of the icon's edge.** (68/300,
15/64, 34/150, 27/120 all land there.) Do not use the §6 radius scale for icons.

### 9.2 The cursor

A blinking `primary` block, roughly `0.52 × cap-height` wide, with `glowSm`. It
appears in the **large app icon and the in-app/site wordmark**, and **drops below
~32px** where it turns to mush.

### 9.3 Size ramp

| Size | Contents |
|---|---|
| ≥64 | `›a` + glow + hairline ring |
| 48, 32 | `›a`, hairline ring, no glow |
| 20 | `a` only on `bg` |
| 16 | `a` in `onPrimaryInk` on a solid `primary` tile |

Favicon is always just `›a` — the full word plus cursor is the **site header**
lockup, never the favicon.

### 9.4 Variants

Circle (watch/avatar), inverse (`linear-gradient(150deg, primary, #7A0F48)` with
white `a`), monochrome dark-on-light (`#1A1118` on `#F3EEF1`), monochrome
light-on-dark (`#E8E8EE` on `#0A0A0F`).

### 9.5 Rendering constraint

Brand assets **must be rendered with Inkscape**, not ImageMagick's SVG delegate —
only Inkscape renders the `feGaussianBlur` neon glows faithfully. JetBrains Mono
advance is **≈0.62 em/char** for type auto-fitting. Headlines need
`xml:space="preserve"` or SVG glues words together at `<tspan>` boundaries.

### 9.6 Voice

All lowercase. Em-dashes for asides, `·` as a separator. Plain and technical, no
marketing inflation: *"direct device-to-device over iroh — no server in the
middle."* The product name is always lowercase **azula**, even sentence-initial.

---

## 10. Name mapping

Current → canonical. Use when reading or migrating code.

### `AzulaColors` (`theme/.../Color.kt`)

| Current | Canonical |
|---|---|
| `bg0` | `bg` |
| `bg1` | `surface` |
| `bg2` | `surfaceSubtle` |
| `bgSidebar` | `bgSunken` |
| `bgGradTop` | `bgWash` |
| `codeBlock` | `bg` (duplicate of `bg0`) |
| `inputBg` | `surfaceInput` |
| `msgOther` | `surfaceMessage` |
| `surfaceAlt` | `surfaceRaised` |
| `border` … `border5` | `outlineFaint` · `outlineSubtle` · `outlineSoft` · `outline` · `outlineStrong` |
| `pink` / `pinkLight` / `pinkDark` / `pinkDeep` | `primary` / `primaryLight` / `primaryDark` / `primaryDeep` |
| `online` / `onlineBright` / `warn` / `error` | `success` / `successBright` / `warning` / `danger` |
| `muted` | `contentSubtle` |
| `textBright` / `text0` / `text1` / `text2` | `contentBright` / `contentStrong` / `contentHigh` / `content` |
| `textDim` / `textDim2` / `textFaint` / `textFaint2` | `contentMuted` / `contentDim` / `contentFaint` / `contentFaintest` |
| `termGreen` / `termPromptUser` | `termText` / `termPrompt` |
| `accent`, `mac*` | unchanged |

### Site CSS (`azula-site/src/pages.ts`)

| Current | Canonical | Note |
|---|---|---|
| `--pink` / `--pink2` | `--primary` / `--primary-light` | |
| `--green` | `--success` | |
| `--bg0` / `--bg2` | `--bg` / `--surface-subtle` | |
| `--bg1` | `--surface` | **currently dead — 0 uses** |
| `--line` / `--line2` | `--outline-subtle` / `--outline-soft` | |
| `--t0` / `--t1` | `--content-strong` / `--content` | |
| `--dim` / `--faint` | `--content-dim` / `--content-faint` | |
| — | `--primary-dark` | `#c4156e` is hardcoded in `.btn.primary` |
| — | `--bg-wash` | `#120a18` is hardcoded in the body gradient |

**These renames are applied.** The site's `:root` now uses the canonical names,
`--bg1` was deleted as dead rather than given an invented use, and `--warning` /
`--danger` / `--accent` were added (declared but not yet consumed).

**Two site-local exceptions.** `--surface-code` (`#1a1a23`, inline `code` fill) and
`--content-code` (`#cdd6e0`, `pre code` text) are **not** in the shared palette.
The nearest canonical members — `surfaceInput` `#15151D` and `contentHigh`
`#E6E6EE` — are visibly darker and brighter respectively, so snapping to them
would have changed how every code block renders. They were kept as their own
tokens instead.

This means **web code styling and app code styling genuinely diverge**: the app
uses `codeBlock` `#070709`, the site uses `#1a1a23`. That is unreconciled, not
intentional design. Worth resolving the next time code presentation is worked on
in either place — but resolving it is a visual-design decision, not a rename.

### `gen.py` (store-listing-assets)

| Current | Canonical | Note |
|---|---|---|
| `BG` | `bg` | |
| `PINK` | `primary` | |
| `GREEN` | `brandPrompt` | |
| `WHITE` | `contentBright` | |
| `MUTED` = `#8a8a9a` | **`contentDim`** | Name collision — the app's `muted` is `#7A7A8A`. |

### `A2uiTokens`

Already semantic and closest to canonical. Renames: `surfaceAlt` →
`surfaceRaised`, `muted` → `contentSubtle`, `mutedFaint` → `contentFaint`,
`selectionFill` → `primarySelected` (value unchanged at 14%).

`mutedSmall` (`contentDim`) has no canonical counterpart — it exists solely as the
accessible companion to `mutedFaint` for text ≤12sp (§3.5). If the text ramp is
ever consolidated, this pair collapses.

---

## 11. Known divergences

Cross-reference with [`docs/tech-debt.md`](tech-debt.md) before structural work.

### Resolved

1. ~~**Alpha-pink sprawl**~~ — the 6 unnamed variants across 12 call sites in
   `Settings.kt`, `Sidebar.kt`, `MobileApp.kt`, `Connect.kt` and `ShareInvite.kt`
   now use the §3.4 scale. Only two values shifted (10%→8%, 12%→14%), both
   sub-perceptual on a near-black ground.
2. ~~**`MaterialTheme` under-configured**~~ — now receives a full `Typography`
   (from `AzulaType`), `Shapes` (from `AzulaShapes`), and a `darkColorScheme` with
   every role filled from `AzulaColors`. No Material purple can leak into
   `DropdownMenu` / `AlertDialog` / `TextButton` any more.
3. ~~**Duplicate brushes**~~ — `AzulaBrushes` in `theme/` is now the single
   definition; `Common.PinkButtonBrush` and `A2uiTokens.primaryBrush` are aliases.
4. ~~**Stale docs**~~ — `azula-app/design/README.md` fixed; it no longer carries
   its own palette copy.
5. ~~**Site token layer**~~ — `:root` renamed to canonical names, dead `--bg1`
   deleted, `#c4156e` and `#120a18` pulled into `--primary-dark` / `--bg-wash`,
   and `--warning` / `--danger` / `--accent` added.
6. ~~**Site accessibility**~~ — a `:focus-visible` ring (2px `--primary-edge`,
   2px offset) now covers every focusable element; the cursor blink is guarded by
   `prefers-reduced-motion` and stays visible at `opacity:1` when animation is off.

7. ~~**Background gradient conflict**~~ — *the root wash won.* All five
   `verticalGradient(surfaceSubtle, surface)` pane overrides removed, plus the
   opaque `bg1` fill in `DesktopApp.kt` that was masking the wash on desktop.
   Desktop and mobile now share one background treatment. Only `SettingsScreen`
   keeps a flat fill, identically on both platforms.
8. ~~**Radius literals**~~ — 69 sites migrated to `AzulaShapes` across `shared/`,
   `markdown/` and `terminal-real/`. The only inline radius left is the 1dp cursor
   rect in `Sidebar.kt`, which is a shape, not a corner radius.
9. ~~**Contrast: `contentFaint` on small text**~~ — 23 direct call sites promoted
   to `contentDim`, plus the 9 sub-12sp consumers of the `A2uiTokens.mutedFaint`
   alias moved to the new `mutedSmall`. See §3.5.

### Open

10. **Component primitives — partially done.** Five extensions now exist in
    `theme/.../Modifiers.kt` and back the A2UI renderer (§7.5). 16 hand-rolled
    surfaces migrated; roughly 20 remain, each skipped for a specific reason —
    border-only with no fill, conditional fills, stateful chips, or genuinely
    bespoke. Those need per-site design decisions, not a sweep.
    `BasicTextField` is still hand-built in 3 places.
11. **App/site code styling diverges** — app `codeBlock` `#070709` vs site
    `--surface-code` `#1a1a23`. See §10.
12. **Half-pixel type on the site** — `13.5px` / `12.5px` survive on 8 lines in
    dense inline layouts. Folding them to the §4.3 scale needs visual QA.
13. **No visual regression testing.** Every change in this effort was verified by
    compilation and by reading code, never by looking at the running app. The
    token work is mechanically sound but nobody has *seen* it. Screenshot tests
    over the `-mock` builds would make the next sweep far safer.

### Accepted — not debt

These were considered and deliberately kept. Don't re-open them as cleanups.

- **The 9-step text ramp and 3-step surface ramp stay.** They look over-specified
  from a token count alone, but §7.5 shows all three surfaces are load-bearing in
  real recipes, so merging them would mean changing designs rather than tidying
  names. The cost of consolidating (touching every screen, with no way to verify
  tone shifts except by eye) outweighs the tidiness.
- **Space Grotesk stays unbundled.** `Fonts.ui` resolves to the system sans on
  every platform, so prose renders in a substitute face rather than the mock's.
  Accepted for now to avoid committing a font binary; revisit when the app's
  typography is being worked on directly. `Fonts.mono` (JetBrains Mono) *is*
  bundled and correct, and mono is the dominant voice (§4.2), so the visible gap
  is smaller than it sounds.
- **Dark-only.** See §12.

---

## 12. Platform constraints

**Site.** `azula-site` must load **nothing off-origin** — enforced by a test in
`src/pages.test.ts` that fails any absolute-URL `<link|script|img|iframe>`, and
asserted as fact on the privacy page. So: no webfonts, no external stylesheets,
no CDN. Tokens must compile to an inline `<style>` string. The site also has no
build step for CSS and zero runtime dependencies — keep it that way.

**App.** Dark-only is load-bearing: `darkColorScheme(...)` is a process-wide
`private val`, not composable state, so it cannot vary per-composition. Values
like `scrimHeavy` and `bg` encode darkness directly. Adding light mode means
restructuring `Theme.kt` and revisiting every inline literal — treat it as a
project, not a tweak.

**Module home.** `azula-app/theme/` is the right home for app-side tokens. The
dependency direction is already clean (`theme ← a2ui ← shared`), so adding
`AzulaSpacing`, `AzulaShapes` and `AzulaType` alongside `AzulaColors`, then
promoting the `A2uiTokens` semantic layer up into `theme/`, requires no
restructuring.

---

## 13. Keeping in sync

This page is normative. When a token changes here, update the derived copies:

| Copy | Path |
|---|---|
| App palette | `azula-app/theme/src/dev/azula/theme/Color.kt` |
| App semantic tokens | `azula-app/a2ui/src/dev/azula/a2ui/A2uiTokens.kt` |
| Site CSS | `azula-site/src/pages.ts` (`STYLE`, `:root`) |
| Site favicon | `azula-site/src/icon.ts` |
| Store assets | `azula-docs/.claude/skills/store-listing-assets/scripts/gen.py` |
| Brand SVGs | `azula-app/design/icon/*.svg` |

A2UI **components** additionally follow the sync rule in
[`docs/a2ui.md`](a2ui.md) — renderer, `render_ui` description in
`azula-cli/src/bridge.rs`, and that page.
