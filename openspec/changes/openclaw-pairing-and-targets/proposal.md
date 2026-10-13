# Pair through OpenClaw, and let the agent start a conversation

## Why

Setting up a real gateway (OpenClaw 2026.10.2 on houston, 2026-10-12) exposed
three gaps between the `openclaw-channel` spec and the plugin:

- **The pairing affordance never existed.** The spec requires pairing to be
  surfaced through the channel by presenting azula's own invite. The plugin had
  the pieces (`start_pairing`, `pairingMessage`) and called none of them; its
  README pointed at `azula pair`, which imports a device's ticket — the
  opposite direction. A phone must pair with the channel's *own* persistent
  session, which only the gateway's running account holds, so no CLI-side
  command could mint a usable invite while the gateway ran.
- **`device` could not be known before pairing.** A phone that pairs by
  redeeming an invite registers under its full endpoint id, so the operator
  cannot fill in the required `device` until after pairing — and an account
  whose device is not yet paired refused to start.
- **The agent could not start a conversation.** `openclaw message send`,
  cron/heartbeat delivery and the agent's `message` tool all failed with
  `Unknown target`: no target resolution, and `deliveryMode: "direct"` sent CLI
  sends to a process that has no bridge. Only replies to the phone worked.

(The same session also found that 0.0.2 never started its bridge inside a live
gateway at all; 0.0.4 wired the gateway adapter. That met requirements this
spec already had, so it needed no spec change.)

## What Changes

- `device` becomes optional. An account without one starts in a waiting state
  — bridge up, holding its session, no agent traffic — and says how to pair.
- `openclaw channels login --channel azula [--account …]` asks the running
  gateway's account for azula's own invite (URL + QR) and waits. If the account
  is not running (blocked on an unpaired `device`), the gateway opens its
  session just for the pairing. The first phone *this session sees connected*
  is adopted — never a phone paired to another session — saved to
  `channels.azula[.accounts.<id>].device`, and the account goes ready. Where
  config writes are disabled it is adopted in memory, with the exact
  `openclaw config set` line surfaced. One phone per account; replacing it is
  `config unset` then login. `scripts/pair.mjs` remains the offline path.
- A configured but unpaired `device` stays a terminal configuration error, now
  pointing at the login command.
- Proactive sends resolve a target — the device name or `azula:<device>` — to
  the owning account's direct conversation (`--account` respected), fail
  naming the paired device when unknown, and go through the gateway
  (`deliveryMode: "gateway"`). Cron and heartbeat get the account's phone as
  their default destination.
- Config changes under `channels.azula` restart only the affected account.
- `assertDeviceKnown` matches the device name exactly (it substring-matched the
  whole `list_devices` text, so a short name could falsely pass).

## Capabilities

### Modified Capabilities

- `openclaw-channel`: configuration (optional device), access control (the
  pairing affordance as built, adoption), prerequisites (waiting vs blocked),
  plus a new requirement for proactive sends.

## Impact

- **azula-openclaw** 0.0.5: new `src/{pairing,login,adopt,messaging}.ts`;
  `lifecycle`, `gateway`, `channel`, `status`, `accounts`, `access`, `agent`,
  `sdk`, `bridge` edited; manifest schema (`device` optional, `configWrites`);
  README.
- **Security note:** while an account waits, the first phone to redeem a valid
  invite for that session is adopted with owner rights — the invite is the
  secret, consistent with azula pairing being the access boundary (design D5).
- No azula-cli or app change required (bare-id redial in azula-cli 0.3.1 makes
  restarts recover; see `cli-device-presence`).
