## ADDED Requirements

### Requirement: Recovery-phrase restore behavior SHALL be an explicit product decision, documented in design.md

Whether restore requires a second confirmation before overwriting the current identity, whether the overwritten identity is archived or discarded, and whether `reconnectSaved()` runs against the previous identity's saved peer tickets after a restore SHALL each be a deliberate, documented decision rather than an unreviewed side effect of implementation order.

This requirement is about the decision being made and recorded, not about which way it comes out — the underlying product questions are still open (see proposal.md). Once decided, a follow-up delta should assert the concrete resulting behavior (e.g. restore SHALL/SHALL NOT require a second confirmation) and this requirement's scenario should be updated to match.

#### Scenario: Restore-flow behavior matches what design.md documents

- **WHEN** a user completes a recovery-phrase restore (valid paste, commit)
- **THEN** the app's actual behavior for confirmation-before-overwrite,
  archival-vs-discard of the previous identity, and post-restore
  `reconnectSaved()` scoping matches what `openspec/specs/identity/design.md`
  (Restore flow) documents — no undocumented divergence between code and spec
