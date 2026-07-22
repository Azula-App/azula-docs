## 1. Correct §7.1 (Glow — the signature)

- [x] 1.1 Replace the `shadow(10.dp, rMd, spotColor = primary, ambientColor = primary)`
      prescription with `Modifier.azulaGlow(...)`, keeping the five glow token
      rows above it unchanged
- [x] 1.2 Add the short rationale: the elevation model's spot shadow is offset
      by a light source above the window (and grows with distance down the
      screen), `spotColor`/`ambientColor` need API 28+, and both are ignored on
      iOS/JVM — so no `shadow(...)` form can express `0 0 Npx`
- [x] 1.3 Map the token scale onto `azulaGlow`'s parameters (`radius` = the
      token's blur, `alpha` = its alpha; defaults `8.dp` @ `.40` = `glowSm`)
      so the table drives call sites instead of a hardcoded `10.dp`
- [x] 1.4 Verify the wording against `azulaGlow`'s KDoc in
      `azula-app/theme/src/dev/azula/theme/Modifiers.kt` — page and code must
      agree on offset, platform behavior and the ancestor-clip caveat

## 2. Correct §7.5 (Surface recipes)

- [x] 2.1 Update the **Primary button** row so "+ glow" reads as the
      `azulaGlow` → `clip` → `background(primaryBrush)` chain that
      `azulaButtonSurface(Primary)` actually paints
- [x] 2.2 Confirm the other four recipe rows still match `Modifiers.kt` and
      leave them unchanged

## 3. Protect the neutral shadow

- [x] 3.1 Leave §7.2 and its `shadowCard` / `shadowModal` tokens untouched
- [x] 3.2 Confirm `azulaCard`'s `shadow(6.dp, shape)` is not altered and that
      no §7.1 edit implies it should be — the neutral shadow legitimately has a
      vertical offset and the elevation model expresses it correctly

## 4. Record and validate

- [x] 4.1 Add a Resolved entry to §11 noting the glow prescription was corrected
      from a colored elevation shadow to the painted `azulaGlow` halo
- [x] 4.2 Check the rest of `design.md` for any other reference to the old
      colored-shadow chain (e.g. §9.2's `glowSm` cursor mention) and correct
      anything that prescribes `shadow(...)` for a glow
- [x] 4.3 Run `openspec validate --all` and confirm it passes
