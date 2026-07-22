## Context

Mobile keyboard focus works like this today:

- `LiveTerminalView` renders `RawTerminalInput` (an invisible `BasicTextField`,
  `matchParentSize()`) *first* in a Box, with the grid drawn over it.
- A tap pointerInput attached to that field's own modifier chain **never fires**
  on a real device — confirmed on-device and documented at `Terminal.kt:142`.
  Compose's `BasicTextField` doesn't route real hit-testing through the modifier
  chain handed to it the way it does `focusRequester`.
- So focus-reclaim is driven from the *outer Box*: `tapMod`'s `onTap` bumps
  `reclaimFocusSignal`, and `MobileRawTerminalInput`'s
  `LaunchedEffect(reclaimFocusSignal)` requests focus and shows the keyboard.
- `tapMod` is `Modifier` (a no-op) when `live == false` **or**
  `mouseTrackingMode != OFF`.

That last condition is the bug. It's correct that the grid's taps belong to the
TUI — `AltScreen`'s gesture is hit-tested first (it's drawn after
`RawTerminalInput`, and Compose hit-tests in reverse draw order) and reports
them as mouse events. But it leaves no path back to the keyboard.

`TerminalKeysBar` already exists as an always-visible accessory row —
`esc`, `tab`, `paste`, `←↓↑→` — rendered outside the grid.

## Goals / Non-Goals

**Goals:**

- Keyboard focus is reclaimable on mobile in every state the terminal can be
  in, including with a mouse-tracking mode active.
- Zero change to what a single-finger tap on the grid does.
- Discoverable without documentation.

**Non-Goals:**

- Desktop. The jvm `RawTerminalInput` actual re-focuses itself and ignores
  `reclaimFocusSignal` entirely.
- Reworking the `BasicTextField` hit-testing problem itself — that's the
  underlying platform quirk this design routes around, not a thing to fix here.
- Any change to mouse-report encoding or the gesture that produces it.

## Decisions

**A keycap in `TerminalKeysBar`, not a grid gesture.** The bar is already
on-screen, already the place for "terminal actions that aren't typing", and sits
entirely outside the grid's pointer regions — so it cannot race the
mouse-reporting gesture, cannot be swallowed by it, and needs no coordination
with it at all. It costs one slot in the bar.

Alternatives considered:

- **Two-finger tap on the grid** — no UI change, but undiscoverable, and it has
  to be distinguished from the start of a pinch or a second finger landing
  mid-drag. It also puts new logic inside the exact gesture block that mouse
  reporting depends on, which is the code path with the least test coverage.
- **Long-press** — cheap to wire, but long-press is a legitimate gesture for a
  TUI to want reported, and reserving it would delay or eat every tap-and-hold.
  It also collides with the selection long-press if that's ever re-enabled
  under mouse tracking.
- **Re-enable `tapMod` and let both fire** — a tap would both report a mouse
  click and summon the keyboard. Rejected: the keyboard would pop up on every
  interaction with a TUI, which is worse than the bug.

**Trigger the existing signal, don't add a second path.** The keycap bumps
`reclaimFocusSignal` — the same mechanism the tap uses — so there's one
focus-reclaim path with one set of semantics, and the `LaunchedEffect` in
`MobileRawTerminalInput` stays the single place that knows how to request focus.

**Show the keycap unconditionally, not only under mouse tracking.** A control
that appears and disappears based on a mode the user can't see is worse than one
that's always there. It's harmless when `tapMod` is live — it just does what a
tap already does.

## Risks / Trade-offs

- **One more keycap crowds the bar on a narrow phone** → the bar already
  handles seven caps; if width is tight, the arrows are the group most likely
  to want a scroll or a second row, which is a separate concern.
- **The keycap fires but focus doesn't take, because the field is in some state
  the `LaunchedEffect` doesn't handle** → the on-device task must verify the
  full cycle (dismiss keyboard → tap keycap → type → text reaches the PTY),
  not just that the keyboard animates in.
- **Someone later re-enables `tapMod` under mouse tracking and reintroduces the
  trap in reverse** → the spec requirement is written about the *outcome*
  (focus is reclaimable in every state), not the mechanism, so it stays true
  however the affordance is implemented.

## Open Questions

- Label: `kbd`, `⌨`, or a glyph? The existing caps are lowercase words
  (`esc`/`tab`/`paste`) and arrows, so a word probably fits the set better.
- Should the keycap *toggle* (dismiss the keyboard too) or only summon? Toggle
  is more useful on a small screen where the keyboard covers half the grid, but
  it needs a reliable read of current IME visibility.
