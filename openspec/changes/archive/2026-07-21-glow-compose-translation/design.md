## Context

§7.1 of `specs/design-system/design.md` is self-contradictory. It defines the
glow token as `0 0 Npx` with no offset — "light comes from the accent, not from
above" — and then prescribes a Compose translation that can only produce light
from above:

```
shadow(10.dp, rMd, spotColor = primary, ambientColor = primary)
```

`Modifier.shadow` is not a blur primitive; it sets a node's elevation and hands
rendering to the platform shadow system. On Android that system models a light
source positioned above and behind the window, so the *spot* component is
displaced downward and outward, and the displacement grows with the node's
distance from the light — a primary button near the bottom of a tall screen
picked up a visibly offset dark band. Two further limits: `spotColor` and
`ambientColor` are honoured only on API 28+, and on the iOS and JVM targets the
color arguments are ignored altogether, so the "magenta glow" rendered as a
black drop shadow on two of the three platforms azula ships.

The app-side fix already landed. `theme/.../Modifiers.kt` defines
`Modifier.azulaGlow(shape, radius, color, alpha, steps)`, which paints the halo
directly in `drawBehind` as nested translucent rounded rects, and
`azulaButtonSurface(Primary)` calls it. The page was never updated, so the
normative source now prescribes the exact chain the code deliberately removed.
Under the "Normative Precedence of design.md" requirement that makes the *code*
formally defective, which is backwards.

## Goals / Non-Goals

**Goals:**

- §7.1 prescribes `azulaGlow(...)` and reads consistently with the token's own
  "no offset" rule.
- The page explains *why* the elevation model can't express the token, so the
  prescription isn't re-"simplified" back to `shadow(...)` by a future reader.
- The glow token table drives `azulaGlow`'s `radius`/`alpha` arguments, rather
  than the single hardcoded `10.dp` the old line implied.
- §7.5's Primary button row points at the corrected chain.
- The fix is recorded in §11 rather than landing silently.

**Non-Goals:**

- Changing any token *value*. The five glow entries in the §7.1 table are
  correct and stay byte-for-byte.
- Touching §7.2 or `azulaCard`'s `shadow(6.dp, shape)`. That is the neutral
  `shadowCard` (`0 8px 26px rgba(0,0,0,.35)`) — an offset, ground-shadow token
  the elevation model expresses correctly. Only the *colored, offset-free* glow
  was mis-prescribed.
- Updating §13 derived copies. No token value moves, and the web DS package
  already expresses the glow as native CSS `box-shadow: 0 0 Npx`, which has no
  such limitation.
- Code changes. `Modifiers.kt` is already the reference implementation.

## Decisions

**Prescribe `azulaGlow(...)`, not a corrected `shadow(...)`.** There is no
correct `shadow(...)` form — the offset is intrinsic to the elevation model, not
a parameter. Alternatives considered: (a) `graphicsLayer` + `RenderEffect` blur,
which is API 31+ on Android and would leave the same platform hole; (b) a
9-patch or drawable halo, which can't take a runtime tint from the token scale.
Painting rings in `drawBehind` is the only approach that renders identically on
Android, iOS and JVM, which is the property the token actually needs.

**Give the parameters, not a single call.** The old line pinned `10.dp`, a value
that appears nowhere in the token table — it matched no glow step. Documenting
the `radius`/`alpha` pairing lets each of `glowSm`…`glowXl` map onto a call, and
makes `azulaGlow`'s defaults (`8.dp` @ `.40`) legible as `glowSm`.

**Keep the explanation on the page, short.** §7.1 is a token table, not an
essay; the full rationale already lives in the `azulaGlow` KDoc. The page gets
the two or three sentences a reader needs to not undo the fix, and the code
keeps the detail.

**Record it in §11 as Resolved.** The "Known Divergences Are Tracked, Not
Silent" requirement covers code drifting from the page; this is the page
drifting from the code, which is the more dangerous direction because the page
is normative. Same ledger.

## Risks / Trade-offs

**The prescription now names an app-side extension, coupling the page to
`Modifiers.kt`.** → It already does this in §7.5 for all five recipes, so it is
the established pattern, not a new coupling. The token table above stays
platform-neutral, and the CSS form (`box-shadow`) remains the primary
expression.

**A reader may generalize "never use `shadow(...)`" from the fix.** → The
§7.2/§7.5 non-goal is stated explicitly in the page edit and in tasks, so the
neutral-shadow case stays clearly legitimate.

**No automated check keeps this honest** (§11's open "no automated visual
regression testing" item). → Out of scope here; the offset regression is visible
in the existing Maestro screenshots if anyone reintroduces it, and that item
already tracks the gap.
