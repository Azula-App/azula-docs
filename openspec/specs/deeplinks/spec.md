# Deeplinks Specification

## Purpose
Defines the Universal Links (iOS) / App Links (Android) contract that lets
`https://azula.app/i/<payload>` (and legacy `/s/`, `/connect/` paths) open
azula-app directly and route into the connect flow, and the well-known files
the site must serve for platform verification.

## Requirements

### Requirement: Site serves the well-known verification files
`azula-site` SHALL serve the iOS Apple App Site Association (AASA) file and
the Android `assetlinks.json` file at their required well-known paths, as
valid unredirected JSON.

#### Scenario: Fetching the AASA
- **WHEN** a client requests `https://azula.app/.well-known/apple-app-site-association`
- **THEN** the site SHALL respond `200` with `content-type: application/json`
  and no redirect

#### Scenario: Fetching assetlinks.json
- **WHEN** a client requests `https://azula.app/.well-known/assetlinks.json`
- **THEN** the site SHALL respond with valid JSON at `content-type: application/json`

### Requirement: Verification identities must be real before going live
The AASA's iOS app identifier and the Android SHA-256 fingerprint SHALL be
filled with real values (not placeholders) before either platform's link
verification can succeed, and the site SHALL be redeployed after any change
to these values.

#### Scenario: Placeholder values are still present
- **WHEN** `IOS_APP_ID` or `ANDROID_SHA256` in `azula-site/src/wellknown.ts`
  still holds a placeholder (`TEAMID` or `REPLACE_WITH_RELEASE_SHA256_FINGERPRINT`)
- **THEN** the corresponding platform's link verification SHALL NOT be
  considered finished, and app/universal links for that platform SHALL NOT be
  relied upon to open the app

#### Scenario: A verification value changes
- **WHEN** `IOS_APP_ID` or `ANDROID_SHA256` is updated to its real value
- **THEN** `azula-site` SHALL be redeployed before that platform's link
  verification can pass, and both identities SHOULD go live together once both
  are real

### Requirement: Android SHA-256 must be the app-signing certificate
The Android fingerprint published in `assetlinks.json` SHALL be the SHA-256 of
the **app-signing** certificate (Play App Signing's Google-managed key when
used), not the upload certificate.

#### Scenario: Copying the fingerprint from Play Console
- **WHEN** populating `ANDROID_SHA256` for a Play App Signing app
- **THEN** the value SHALL be taken from Play Console → Test and release → App
  integrity → App signing key certificate, not from the local upload keystore

### Requirement: iOS entitlements and manifest declare the verified domain
The iOS app SHALL declare `applinks:azula.app` in its entitlements and enable
the Associated Domains capability, with its bundle id matching the AASA's
declared app id.

#### Scenario: Verifying Universal Links end-to-end
- **WHEN** validating the iOS Universal Links setup
- **THEN** `ios-app/src/azula.entitlements` SHALL list `applinks:azula.app`,
  the Associated Domains capability SHALL be enabled in Xcode, and the bundle
  id SHALL match the AASA's `IOS_APP_ID` — and verification SHALL be tested on
  a real device, since Universal Links are unreliable in Simulator

### Requirement: Android app-link intent-filter covers all live invite paths
The Android app-link `autoVerify` intent-filter SHALL cover every currently
live invite path, including `/i/` alongside the legacy `/s/` and `/connect/`
paths, and the AASA/assetlinks path lists SHALL match.

#### Scenario: Finalizing the deep link values
- **WHEN** the placeholder deep link values are finalized
- **THEN** `/i/*` SHALL be present in both the Android intent-filter and the
  AASA/assetlinks path lists alongside the legacy paths

### Requirement: A verified link opens the app and dials the session
A valid `https://azula.app/i/<payload>` link tapped on a device with both platform identities verified SHALL open azula-app and route the payload into the existing connect flow.

#### Scenario: Tapping a real invite link
- **WHEN** a user with the app installed taps `https://azula.app/i/<payload>`
  and both `IOS_APP_ID`/`ANDROID_SHA256` are real, deployed values
- **THEN** the OS SHALL open azula-app directly (no browser interstitial), and
  `AzulaLinks.parse` SHALL hand the payload to `ConnectService.connectPeer` via
  the `AzulaState` coordinator

#### Scenario: Manually testing Android link handling
- **WHEN** verifying Android app-link handling manually
- **THEN** `adb shell am start -a android.intent.action.VIEW -d "https://azula.app/s/TESTTOKEN"`
  SHALL open the app, and `adb shell pm get-app-links app.azula` SHALL report
  the domain as verified
