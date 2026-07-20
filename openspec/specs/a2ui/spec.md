# A2ui Specification

## Purpose
A2UI lets an agent stream a declarative component tree (via the MCP bridge's
`render_ui`) that azula-app renders live, implementing the A2UI Basic Catalog
wire protocol styled in azula's neon-glass design language.

## Requirements

### Requirement: A2UI Wire Protocol Version
The app SHALL implement A2UI Basic Catalog wire protocol v0.9.1: the
`createSurface`, `updateComponents`, `updateDataModel`, and `deleteSurface`
operations.

#### Scenario: Creating a surface
- **WHEN** the bridge sends a `render_ui` call for a new surface
- **THEN** the app performs `createSurface` followed by `updateComponents`
  (and `updateDataModel` if a data model was supplied)

### Requirement: Component Catalog Coverage
The renderer SHALL support the declared component catalog across three
categories: content (Text, Image, Icon, Video, AudioPlayer), layout (Row,
Column, List, Card, Tabs, Divider, Modal), and input (Button, TextField,
CheckBox, ChoicePicker, Slider, DateTimeInput). Each component SHALL be
dispatched by its `"component"` type field.

#### Scenario: Rendering a component tree
- **WHEN** the surface view receives a component tree
- **THEN** it dispatches each node to its renderer based on that node's
  `"component"` type field

### Requirement: Text Markdown Subset
The Text component SHALL render a defined Markdown subset — `###` headings,
`-` bullets, `**bold**`, `*italic*`, and `` `code` `` — across its h1–h6,
body, and caption variants.

#### Scenario: Bold and heading text
- **WHEN** a Text component's content includes `### Heading` and `**bold**`
- **THEN** the renderer displays a heading-styled line and bold-styled
  inline text, not the literal markdown characters

### Requirement: Image and Audio Data-URI Constraint
The Image component's `url` prop SHALL only render an embedded
`data:image/...;base64,...` URI; a remote `http(s)://` URL SHALL render a
themed placeholder rather than being fetched. AudioPlayer SHALL play for real
only when given a `data:audio/...;base64,...` URI; a remote URL or a missing
`url` SHALL fall back to a static mock waveform.

#### Scenario: Data-URI image renders
- **WHEN** an Image component is given a `data:image/png;base64,...` URL
- **THEN** the app decodes and renders it inline

#### Scenario: Remote image URL falls back to placeholder
- **WHEN** an Image component is given an `http://` URL
- **THEN** the app renders a themed placeholder instead of fetching the URL

### Requirement: Data-Model Bindings Are Path-Only
The app SHALL resolve only `{"path":"/ptr"}` JSON-pointer data-model
bindings. Client-side formatting/computation functions (e.g.
`formatCurrency`, `pluralize`) SHALL be agent-side responsibilities that the
app does not evaluate.

#### Scenario: Agent-side formatting function reference
- **WHEN** a component binding references a client function such as
  `pluralize`
- **THEN** the app does not evaluate it — only `{"path": ...}` bindings are
  resolved

### Requirement: Design Tokens Are Not Independently Defined
A2UI SHALL derive its colors, typography, spacing, radius, glow, and brand values from the design-system specification (normative for all of azula) via a derived tokens file, not define them independently within A2UI.

#### Scenario: Adding a new token
- **WHEN** a new visual token is needed by the A2UI renderer
- **THEN** it is added to the design-system specification first, then
  propagated to the A2UI tokens file as a derived copy — not created
  directly in the A2UI tokens file

### Requirement: Component Catalog Kept in Sync Across Three Surfaces
Any new component or variant SHALL be added, in the same change, to all
three of: the renderer, the agent-facing `render_ui` tool catalog
description, and this capability's documentation.

#### Scenario: Adding a new component variant
- **WHEN** a new component variant is added to the renderer
- **THEN** the `render_ui` tool description and the A2UI documentation are
  updated in the same change, not left to drift
