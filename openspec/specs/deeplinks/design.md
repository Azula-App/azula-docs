# Deeplinks — what to do when the apps are signed

The plumbing is already in place with **placeholders**:

- Site: `azula-site/src/wellknown.ts` serves the iOS AASA and Android `assetlinks.json`
  (placeholders `TEAMID` and `REPLACE_WITH_RELEASE_SHA256_FINGERPRINT`).
- Android: app-link intent-filter (`autoVerify`) + `azula://` scheme in
  `android-app/src/AndroidManifest.xml`; handled in `MainActivity`.
- iOS: `azula://` scheme in `Info.plist`; `applinks:azula.app` in
  `ios-app/src/azula.entitlements`; `.onOpenURL` in `iosApp.swift`.
- Shared: `dev.azula.link.AzulaLinks.parse` + `DeepLinkBus`; an incoming token is
  dialed by `ConnectService.connectPeer` (via the `AzulaState` coordinator).

The canonical share link is now `https://azula.app/i/<payload>` (a compact,
optionally-signed invite — see `invitations.md`); the Android app-link
intent-filter covers `/i/` alongside the legacy `/s/` and `/connect/` paths, so
add `/i/*` to the AASA/`assetlinks` path lists when finalizing the values below.
Links route into the existing connect flow, so once the values below are real,
tapping `https://azula.app/i/<payload>` opens the app and dials the session.

## iOS (Universal Links)

1. In your Apple Developer account note the **Team ID** (10 chars) and the app's
   **bundle identifier** (`PRODUCT_BUNDLE_IDENTIFIER`).
2. In `azula-site/src/wellknown.ts` set `IOS_APP_ID = "<TeamID>.<bundleId>"` and redeploy
   the Worker.
3. In Xcode (the `ios-app` target): enable the **Associated Domains** capability
   and set **Code Signing Entitlements** to `ios-app/src/azula.entitlements`
   (already lists `applinks:azula.app`). Confirm the bundle id matches step 1.
4. Verify the AASA is reachable, JSON, and un-redirected:
   `curl -i https://azula.app/.well-known/apple-app-site-association`
   → `200`, `content-type: application/json` (the Worker handles this).
5. Test on a **real device** (Simulator universal links are unreliable). For
   faster iteration use `applinks:azula.app?mode=developer` in the entitlement.

## Android (App Links)

1. Get the **SHA-256** of the **release** signing certificate:
   `keytool -list -v -keystore <release.jks> -alias <alias>` → copy the `SHA256`.
   If you use **Play App Signing**, copy the SHA-256 from
   Play Console → Test and release → App integrity → *App signing key certificate*
   (the Google-managed key, not the upload key). You can list both.
2. In `azula-site/src/wellknown.ts` set `ANDROID_SHA256` to that fingerprint
   (uppercase, colon-separated) and confirm `ANDROID_PACKAGE = "app.azula"`
   matches the `applicationId`. Redeploy the Worker.
3. Verify: `curl -s https://azula.app/.well-known/assetlinks.json` returns the JSON
   as `application/json`. Optionally use Google's Statement List Tester.
4. `autoVerify="true"` is already set; the system verifies on install. Manual test:
   `adb shell am start -a android.intent.action.VIEW -d "https://azula.app/s/TESTTOKEN"`
   and `adb shell pm get-app-links app.azula`.

## Deploy the site

```sh
cd azula-site
npm install
npx wrangler login          # once
npx wrangler deploy
```

Add the **azula.app** zone to the Cloudflare account and point DNS at it; the
`custom_domain` routes in `wrangler.jsonc` provision the hostname + certificate.

## Loose ends to finish

- **Store links:** replace the placeholder `#ios-not-published` /
  `#android-not-published` anchors in `azula-site/src/pages.ts` (`STORE_BTNS`) with the
  real App Store / Google Play URLs.
- **MCP bridge:** `/mcp/<token>` is a documented placeholder (Workers can't speak
  iroh). Stand up the bridge and wire it — see `azula-site/URLS.md` ("Why the bridge is
  separate").
- **Link format:** the canonical link is the self-contained `/i/<payload>` invite
  (signed/expiring/revocable, no server state) — see `invitations.md`. The legacy
  `/s/<ticket>` raw-ticket links still parse for the transition and should be
  removed once no old clients remain (tracked in `openspec/changes/invitations-legacy-sunset/`).
