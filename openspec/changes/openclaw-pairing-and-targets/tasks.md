## 1. Pairing through OpenClaw

- [x] 1.1 Make `device` optional in the manifest schema; a device-less account
      starts waiting (bridge up, no runtime, no pump) with a status warning
      naming the login command
- [x] 1.2 Serve `openclaw channels login --channel azula [--account …]` from the
      running account via the gateway's QR-login RPCs, printing azula's own
      invite URL and QR; open a pairing-only session when the account is not
      running
- [x] 1.3 Adopt the first phone this session sees connected (never one paired to
      another session); persist it via the SDK's config-write API, falling back
      to in-memory adoption plus the exact `config set` line when writes are
      off; one phone per account
- [x] 1.4 Configured-but-unpaired `device` stays terminal-blocked, with the fix
      text pointing at login; exact-match `assertDeviceKnown`

## 2. Proactive sends

- [x] 2.1 Target resolution (`<device>`, `azula:<device>`, `--account`) shared
      by `message send`, the agent's message tool and cron/heartbeat; unknown
      targets name the paired device
- [x] 2.2 `deliveryMode: "gateway"` so CLI-side sends reach the gateway's bridge;
      default destination for cron/heartbeat

## 3. Verify

- [x] 3.1 Unit tests for waiting state, adoption, cross-session rejection,
      persistence and fallback, blocked fix text, target resolution, login
      start/wait
- [x] 3.2 Throwaway-profile smoke on OpenClaw 2026.10.2: login prints the invite;
      a second azula identity pairs and is adopted and saved; account-scoped
      reload; `message send` and cron deliver per account
- [ ] 3.3 On houston: `openclaw message send --channel azula` reaches the real
      phone
