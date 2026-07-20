# Building with azula — neon glass

azula is **dark-only**. Every design starts by wrapping the whole page in
`<Screen>` — it paints the near-black radial wash (`--app-background`), sets the
default text color and the UI font. Without it you get components floating on
white and the look is destroyed. There is **no blur** anywhere; depth is a
magenta glow (`0 0 Npx`), never an offset drop shadow.

## Styling idiom

Components carry their own styles. For your own layout glue, write inline styles
(or a small stylesheet) using the CSS custom properties from `styles.css` — never
hard-code hexes and never invent class names:

- Surfaces: `--bg`, `--surface`, `--surface-subtle`, `--surface-raised`, `--surface-input`
- Borders (always 1px): `--outline-faint`, `--outline-subtle`, `--outline-soft`, `--outline`, `--outline-strong`
- Accent: `--primary`, `--primary-light` (links/labels), `--primary-brush` (gradient fills);
  selected/active fills: `--primary-wash` (8%), `--primary-selected` (14%), border `--primary-edge`
- Text: `--content-bright`/`--content-strong` (headings), `--content` (body),
  `--content-muted`, `--content-dim` (secondary); `--content-faint` only above 12px
- Status: `--success`, `--warning`, `--danger`, `--accent` (rare informational cyan);
  terminal: `--term-text`, `--term-prompt`
- Glow: `--glow-sm/md/lg/xl`, `--glow-green`; neutral shadows only `--shadow-card`, `--shadow-modal`
- Type: `--font-mono` vs `--font-ui` — **mono for values** (codes, metrics, IDs,
  timestamps, labels, eyebrows), **sans for sentences**. Sizes `--text-micro` (10)
  through `--text-display-xl` (40); default body is `--text-body` (13px)
- Spacing `--s2…--s48`; radius `--r-xs` (5) `--r-sm` (8) `--r-md` (10, buttons/inputs)
  `--r-lg` (13, cards) `--r-xl` (16, modals) `--r-pill`

Voice: all-lowercase product name "azula"; plain technical copy; `·` as separator.
One `variant="primary"` Button (gradient + glow) per view — everything else stays
quiet (`default`, `ghost`, `borderless`). Uppercase only in `Eyebrow` and table
headers, always mono, always tracked.

## Where the truth lives

Read `styles.css` (tokens + every `az-*` component class) before styling anything;
each component's `.d.ts` is its props contract and its `.prompt.md` shows usage.

## Idiomatic example

```tsx
<Screen>
  <div style={{ maxWidth: 720, margin: "0 auto", padding: "var(--s32) var(--s20)" }}>
    <BrandLockup tagline="p2p over iroh" />
    <div style={{ marginTop: "var(--s24)" }}>
      <Eyebrow index="01">session</Eyebrow>
    </div>
    <div style={{ display: "flex", gap: "var(--s12)", marginTop: "var(--s16)" }}>
      <Card title="Session with zuko" >
        <p style={{ margin: "0 0 var(--s12)", color: "var(--content-muted)" }}>
          Direct path, end-to-end encrypted — no server in the middle.
        </p>
        <Pill>◉ direct · 12ms · e2e</Pill>
      </Card>
    </div>
    <div style={{ display: "flex", gap: "var(--s10)", marginTop: "var(--s16)" }}>
      <Button variant="primary">Connect</Button>
      <Button variant="ghost">Copy code</Button>
    </div>
  </div>
</Screen>
```
