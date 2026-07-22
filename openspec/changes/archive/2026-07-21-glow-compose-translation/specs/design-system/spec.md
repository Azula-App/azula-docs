## ADDED Requirements

### Requirement: Platform Translations Preserve Token Semantics
A platform-specific translation prescribed by `design.md` SHALL preserve the
token's defining property on every platform the app ships to (Android, iOS, JVM
desktop) — for example, a Compose `Modifier` chain given as the translation of a
CSS shadow value. A platform API that can only approximate the token
— because the property is fixed by the API's own model, or is honoured on some
targets but silently dropped on others — SHALL NOT be prescribed as the
translation. A prescription that renders differently from the token is defective
in the same way an incorrect hex value is.

#### Scenario: A prescribed translation cannot express the token
- **WHEN** the platform API named in `design.md` cannot reproduce a defining
  property of the token (e.g. an elevation-based shadow cannot express a
  zero-offset glow, because its offset is intrinsic to the light model)
- **THEN** `design.md` SHALL prescribe an implementation that can reproduce it
- **AND** SHALL state why the platform API was rejected, so the prescription is
  not reverted as an apparent simplification

#### Scenario: A translation degrades on some targets only
- **WHEN** a prescribed API honours an argument on one target but ignores it on
  another (e.g. a shadow color applied on Android API 28+ but dropped on iOS and
  JVM)
- **THEN** the translation SHALL be treated as defective rather than as an
  acceptable per-platform difference
- **AND** the divergence SHALL be recorded per the §11 tracking requirement
  until it is corrected
