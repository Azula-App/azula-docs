## 1. Decide

- [ ] 1.1 Decide whether restore requires a second confirmation before
      overwriting the current identity.
- [ ] 1.2 Decide whether the overwritten identity should be archived instead
      of discarded.
- [ ] 1.3 Decide the intended behavior of `reconnectSaved()` firing against
      the previous identity's saved peer tickets on restore (skip / rescope /
      keep as-is).

## 2. Implement

- [ ] 2.1 Implement the confirmation/archival decision from 1.1/1.2.
- [ ] 2.2 Implement the `reconnectSaved()` decision from 1.3.
- [ ] 2.3 Update `openspec/specs/identity/design.md` (Restore flow) to match.
- [ ] 2.4 Add/adjust tests covering the new behavior.
