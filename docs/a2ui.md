# A2UI — azula's agent-drawn UI

A2UI lets an agent (over the MCP↔iroh bridge, `render_ui`) stream a **declarative
component tree** that the app renders live. The app implements the **A2UI Basic
Catalog** (wire protocol `v0.9.1`: createSurface / updateComponents /
updateDataModel / deleteSurface) styled in azula's **"neon-glass"** language.

This page owns the **component contract**: which components exist, their variants,
and how they map to the renderer and the agent-facing catalog.

**Design tokens are not defined here.** Colors, type, spacing, radius, glow and
brand live in [`docs/design-system.md`](design-system.md), which is normative for
all of azula — app, site and store assets. Anything on this page that mentions a
token refers to a name defined there.

The visual reference is the design project `azula - A2UI Catalog` (Claude Design).

## Where it lives

- **Renderer:** `azula-app/a2ui/src/dev/azula/a2ui/A2uiRenderer.kt` — `A2uiSurfaceView`
  dispatches over each component's `"component"` type.
- **Tokens:** `azula-app/a2ui/.../A2uiTokens.kt` — the semantic tokens the renderer
  draws from (colors, shape scale, gradient), derived from
  [`docs/design-system.md`](design-system.md). Brand colors are shared with
  `theme/.../Color.kt` (`AzulaColors`). `A2uiTokens` is `public` (not `internal`) —
  `shared` exports `../a2ui`, so it's the app-wide chat design source, not just A2UI's; see
  Phase 4 of the chat-consolidation plan (`azula-docs/docs/architecture-di.md`
  isn't the plan doc, but the intent is `Chat.kt`'s bubbles/input/chrome read the
  same tokens instead of separate `AzulaColors` literals).
- **Markdown:** `azula-app/a2ui/.../A2uiMarkdown.kt` — the small Markdown subset used by `Text`.
- **Model / binding / surface state:** `A2uiModel.kt`, `A2uiBinding.kt`,
  `A2uiSurface.kt`, `JsonPointer.kt` in the same module.
- **Catalog docs for the agent:** the `render_ui` tool description in
  `azula-cli/src/bridge.rs` — keep it in lockstep with the renderer's component
  vocabulary and variant names.

## Design tokens

See [`docs/design-system.md`](design-system.md) — §3 color, §4 typography,
§6 radius, §7 glow and gradients. `A2uiTokens.kt` is a derived copy of those
values, not an independent source.

Note that `A2uiTokens` uses names the design system has since superseded
(`surfaceAlt` → `surfaceRaised`, `muted` → `contentSubtle`, `mutedFaint` →
`contentFaint`, `selectionFill` → `primarySelected`); §10 of that page maps them.

Two chat-only shapes ride alongside the shape scale: `rBubbleMe` (15/15/5/15dp)
and `rBubbleThem` (15/15/15/5dp) — the asymmetric "tail" corners for
`MessageBubble`/`ThinkingIndicator` in `shared/.../ui/Chat.kt`. They're not part
of the agent-facing A2UI wire catalog (no `render_ui`/`tools.rs` change), just
app-wide chat chrome that now lives on `A2uiTokens` per Phase 4 of the chat
consolidation (see below).

## Component catalog

Content: **Text** (Markdown: `###` headings, `-` bullets, `**bold**`, `*italic*`,
`` `code` ``; variants h1–h6/body/caption), **Image** (size presets
icon/avatar/smallFeature/mediumFeature(default)/largeFeature/header; `fit`;
data-URI only), **Icon** (vector line icons bolt/terminal/lock/link/chat/controls +
glyph fallback; inherits text color), **Video** (styled mock player — play
button + scrubber; no live playback), **AudioPlayer** (shares the chat waveform
bar, `A2uiAudioBar` — a `data:audio/...;base64,...` `url` plays for real,
play/pause + seekable waveform; a remote http `url` or no `url` falls back to
the same static mock look as before).

Layout: **Row** / **Column** / **List** (invisible containers; justify/align;
List scrolls when horizontal), **Card** (filled surface, or `variant:"nested"` →
transparent + outline), **Tabs** (underline style, local selection), **Divider**
(`axis` horizontal/vertical), **Modal** (`trigger` → `content` glass sheet with a ✕).

Input: **Button** (default / primary-gradient / borderless; `action.event` →
`ui-event`), **TextField** (shortText/longText/number/obscured; two-way binding),
**CheckBox** (rounded pink tick), **ChoicePicker** (chips=pills, or checkbox display →
radio for single / tick for multi; `variant` mutuallyExclusive/multipleSelection),
**Slider**, **DateTimeInput** (ISO 8601 text; native picker is a follow-up).

Client functions (formatCurrency, pluralize, …) are **agent-side** binding helpers —
the app only resolves `{"path":"/ptr"}` data-model bindings.

## Keeping in sync

**Components.** Any new component or variant must be updated in **three** places
together: the renderer (`A2uiRenderer.kt`), the agent-facing catalog (`render_ui`
description in `azula-cli/src/bridge.rs`), and this page.

**Tokens.** Token changes do *not* start here. Change
[`docs/design-system.md`](design-system.md) first — it is normative — then update
the derived copies listed in its §13, of which `A2uiTokens.kt` is one. A token
added only to `A2uiTokens.kt` is drift, not a design decision.
