## Why

`specs/design-system/design.md` §7.1 defines the signature glow as "Always
`0 0 Npx` with **no offset**" and then, two lines later, prescribes
`shadow(10.dp, rMd, spotColor = primary, ambientColor = primary)` as its Compose
translation. The two statements contradict each other: `Modifier.shadow` maps
onto Android's elevation model, whose spot shadow is *displaced* away from a
light source above the window and grows with the node's distance down the
screen, so it cannot express an offset-free halo. `spotColor`/`ambientColor` are
honoured only on API 28+ and ignored outright on the iOS and JVM targets, where
the glow degrades to a black drop shadow.

The app has already been fixed — `theme/.../Modifiers.kt` ships
`Modifier.azulaGlow(...)`, which paints the halo, and `azulaButtonSurface(Primary)`
calls it. Only the normative page still prescribes the broken chain, which
inverts the precedence rule: a contributor following §7.1 today would reintroduce
the defect the code just removed.

## What Changes

- §7.1: replace the `shadow(...)` prescription with `azulaGlow(...)`, and state
  why elevation shadows cannot express the token (directional spot offset,
  API 28+ color support, no color support on iOS/JVM).
- §7.1: map the glow token scale onto `azulaGlow`'s `radius`/`alpha` parameters
  so the table's values, not a fixed `10.dp`, drive call sites.
- §7.5: correct the **Primary button** recipe row so its "+ glow" reads as the
  `azulaGlow` chain rather than the old colored-shadow one.
- §7.2 stays as-is, and `azulaCard`'s `shadow(6.dp, shape)` is explicitly *not*
  in scope — that is the neutral `shadowCard`, which legitimately has a vertical
  offset and is correctly served by the elevation model.
- §11: record the fix as a Resolved divergence so the correction is traceable
  rather than silent.
- Add one requirement to the `design-system` spec: a platform translation
  prescribed by `design.md` must preserve the token's defining property on every
  supported target.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `design-system`: adds a requirement that platform-specific translations named
  in `design.md` must be expressible on every target the app ships to, and must
  preserve the token's defining property (here: zero offset) — a prescription
  that only approximates the token is defective in the same way a wrong hex
  value is.

## Impact

- `openspec/specs/design-system/design.md` — §7.1, §7.5, §11.
- `openspec/specs/design-system/spec.md` — one added requirement.
- No code changes: `azula-app/theme/src/dev/azula/theme/Modifiers.kt` already
  implements the corrected prescription. This change makes the page describe
  what ships.
- No derived-copy (§13) updates: no token *value* changes. The web DS package's
  CSS `box-shadow: 0 0 Npx` already expresses the token natively.
