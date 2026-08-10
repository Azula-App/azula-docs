## Why

On the Pixel 10a (`64271JEA313442`, app build 2026-08-03), minting an invite
from the app produces nothing the user can act on.

Observed while verifying `cli-naming-and-registry-keying` task 5.2. The full
flow was run twice — home → **connect a peer** → **+ create invite** → 24h,
unsigned, multi-use → **create invite**. Each time the bottom sheet dismissed
back to the "connect a peer" screen and:

- no invite appeared on screen (confirmed by screenshot and by
  `uiautomator dump`: the hierarchy after the tap is identical to before it,
  showing only "+ create invite", the join field, and the two links);
- nothing was added to app storage. `run-as app.azula ls -R .` covers the
  whole container — `files/{conversations,eventlog,profileInstalled}` and
  `shared_prefs/{azula_peers.xml,azula_secret.xml}` — and after two mints
  `azula_peers.xml` still held exactly one `azi…` payload, the ticket for the
  already-known bridge peer;
- nothing reached the clipboard (pasting into the app's own "paste an invite
  or code…" field yielded an empty field);
- nothing was logged (`logcat` showed no app output around the taps).

So a user cannot get an invite out of the app. That makes phone-issued
pairing unreachable: the CLI pairs *from* an invite, and there is no way to
obtain one.

There is a second, more serious possibility this raises. `invitations`'
"Issuer-Side Persistence Is Authoritative" requires that acceptance be gated
on the invite id existing in the **issuer's** local issued-invite store. If
the app is minting without persisting to such a store, then even an invite the
user managed to copy would be rejected at redemption, because the issuer would
have no record of it. Nothing in the container looked like an issued-invite
store. That is inference from an absence, not a confirmed diagnosis — task 1
settles it before anything is designed.

## What Changes

Scope depends on task 1's finding; the shape is one of:

- **If the mint silently fails** — fix the failure and surface it. A mint that
  cannot complete SHALL report that to the user rather than dismissing the
  sheet as though it succeeded.
- **If the mint succeeds but is not persisted** — persist issued invites to an
  issuer-side store, so redemption can be gated on them as
  `invitations` already requires, and so revocation has something to revoke.
- **If the mint succeeds and persists but is not presented** — present it:
  the user needs the `https://azula.app/i/…` link, as copyable text and/or a
  QR, plus a share affordance.

In every branch, the user-facing outcome is the same and is what this change
commits to: **completing the create-invite flow SHALL leave the user holding a
usable invite, or SHALL tell them why not.**

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `invitations`: gains a requirement that a completed mint yields a
  user-obtainable invite and is persisted issuer-side. The existing
  "Issuer-Side Persistence Is Authoritative" requirement already governs
  redemption; nothing there is being weakened, and it may need no edit at all
  once task 1 establishes what actually happens.

## Impact

- **azula-app** — the create-invite sheet and whatever backs it; the
  issuer-side invite store if one is missing. Exact files unknown until task 1.
- **Not azula-cli.** `azula invite` mints, persists, and prints a URL and QR
  correctly; that path was exercised repeatedly during
  `cli-naming-and-registry-keying` verification and works.
- **Blocks** the two-phones form of that change's task 5.2, and any pairing
  flow that starts from a phone-issued invite.
- **Unknown: whether current builds still do this.** The observation is from a
  2026-08-03 build, six days old at the time. Reproducing on a current build
  is the first thing task 1 does — this may already be fixed.
