# Design System Specification

## Purpose
Defines the "neon glass" visual language shared across the azula app, site,
and store-listing assets, and the rules that keep six independently-coded
copies of the same token palette from drifting apart.

## Requirements

### Requirement: Normative Precedence of design.md
The design-system `design.md` page SHALL be the normative source for every
visual value (color, typography, spacing, radius, glow/shadow, motion, and
brand construction) across all azula repos. Where any implementation — app,
site, or store-listing assets — disagrees with `design.md`, `design.md`
SHALL be treated as the intended value and the implementation SHALL be
treated as defective.

#### Scenario: Implementation disagrees with the token page
- **WHEN** a derived copy (e.g. `Color.kt`, `A2uiTokens.kt`, `pages.ts`,
  `icon.ts`, `gen.py`, or a brand SVG) contains a value that differs from
  `design.md`
- **THEN** the value in `design.md` SHALL be treated as correct
- **AND** the derived copy SHALL be corrected to match it

### Requirement: No Invented Visual Values
Contributors SHALL NOT introduce colors, type sizes, spacing values, radii,
glow/shadow values, or other visual constants that are not already present
in `design.md`'s token tables.

#### Scenario: A new surface needs a value not yet in the system
- **WHEN** implementing a UI surface that appears to need a color, size, or
  radius not present in `design.md`
- **THEN** the value SHALL be added to `design.md` as a new or extended
  token before it is used in any repo's code

### Requirement: Token Changes Propagate Page-First
When a token's value changes, `design.md` SHALL be updated first, and the
derived copies enumerated in `design.md` §13 SHALL then be updated to match
before the change is considered complete: the app palette (`Color.kt`), app
semantic tokens (`A2uiTokens.kt`), site CSS (`pages.ts`), site favicon
(`icon.ts`), store-listing asset generator (`gen.py`), and brand SVGs.

#### Scenario: A token's hex value changes
- **WHEN** a token's value is changed
- **THEN** `design.md` SHALL be edited first
- **AND** every derived copy listed in §13 SHALL be updated to the new
  value before the change ships

### Requirement: Naming Canonicalization
Token names across repos SHALL follow the canonical semantic names defined
in `design.md` §10 (e.g. `surface`, not a positional name like `bg1`), not
whichever name a given file happens to already use.

#### Scenario: Migrating or renaming a token reference
- **WHEN** a token reference in `AzulaColors`, site CSS, `gen.py`, or
  `A2uiTokens` is renamed or migrated
- **THEN** it SHALL be renamed to the name given by the §10 mapping table
  rather than to an ad hoc or locally-invented name

### Requirement: Known Divergences Are Tracked, Not Silent
Contributors SHALL record any deviation between shipped code and the
canonical token value or name in `design.md` §11, as either an Open item
or an Accepted-not-debt item, if it is not immediately fixed — rather
than leave it undocumented.

#### Scenario: Drift is discovered but not fixed immediately
- **WHEN** a contributor finds code that has drifted from a canonical token
  value or name and does not correct it in the same change
- **THEN** the divergence SHALL be recorded in `design.md` §11 as an Open
  item

### Requirement: Token Scale Collapses Must Check for Contrastive Use
The values' call sites SHALL be checked, before folding two or more values
in a token scale into a single canonical step, for cases where a single
call site uses two of the source values to mean different things (e.g. an
active vs. inactive state). A frequency count of value usage alone SHALL
NOT be sufficient justification for a collapse.

#### Scenario: Collapsing an alpha/opacity scale
- **WHEN** two opacity or color-alpha values are proposed to merge into one
  canonical token
- **THEN** call sites SHALL be checked for a single site using both values
  contrastively (e.g. `if (active) 0x99… else 0x66…`) before the merge is
  made
- **AND** if such a site exists, both values SHALL be retained as distinct
  canonical steps
