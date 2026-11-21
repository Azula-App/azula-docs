## 1. Record the decision

- [x] 1.1 Evaluate irpc 1.0.0 against every azula ALPN and write the per-protocol verdicts into this change's `design.md` (D1–D4); verified by the design naming a verdict for each of the seven ALPNs
- [x] 1.2 Add the `wire-protocols` delta spec (language-neutral format for app-spoken protocols, additive evolution within an ALPN version); verified by `openspec validate irpc-adoption-decision --strict` passing
- [x] 1.3 Write `openspec/specs/wire-protocols/design.md` with the ALPN map (speakers, framing, owning capability), the irpc summary and when to reach for it; verified by every ALPN in `azula-cli/src` and `azula-app/network-api/.../Alpns.kt` appearing in its table

## 2. Land it

- [x] 2.1 Archive the change so the delta merges into `openspec/specs/wire-protocols/spec.md`; verified by `openspec validate --all` passing afterwards
- [x] 2.2 Commit to `azula-docs` `main` and push; verified by `git status -sb` showing `main...origin/main` with nothing ahead
