# Store listing image specs

> These change. **Always confirm against the live store console before submitting**
> — this file is a starting point + a record of what we've targeted, not the
> authority. The generator's `PLATFORMS` dict encodes the same numbers; keep the
> two in sync.

## Google Play (`--platform play`)

| Asset | Count | Format / max size | Dimensions |
|---|---|---|---|
| App icon | 1 | 32-bit PNG, ≤1 MB | **512 × 512** |
| Feature graphic | 1 | PNG/JPEG, ≤15 MB | **1024 × 500** |
| Phone screenshots | 2–8 | PNG/JPEG, ≤8 MB ea | 16:9 or 9:16; each side 320–3840 px |
| 7-inch tablet | up to 8 | PNG/JPEG, ≤8 MB ea | 16:9 or 9:16; each side 320–3840 px |
| 10-inch tablet | up to 8 | PNG/JPEG, ≤8 MB ea | 16:9 or 9:16; each side 1080–7680 px |
| Chromebook | 4–8 | PNG/JPEG, ≤8 MB ea | 16:9 or 9:16; each side 1080–7680 px |

**Promotion eligibility:** include **≥4 phone screenshots at ≥1080 px on each
side.** Our defaults (1080×1920 phones) clear this.

What the generator emits: phone `1080×1920` (9:16) portrait; 7-inch `1920×1080`
(16:9); 10-inch & Chromebook `2560×1440` (16:9). Play accepts the same image in
the 10-inch and Chromebook slots (identical size) — mention the reuse to the user.

## Apple App Store (`--platform appstore`)

| Asset | Count | Format | Dimensions |
|---|---|---|---|
| App icon (marketing) | 1 | PNG, **no alpha, no rounding** | **1024 × 1024** |
| iPhone 6.9" display | up to 10 | PNG/JPEG | **1290 × 2796** portrait (or `2796×1290`); `1320×2868` also accepted |
| iPhone 6.5" display | up to 10 | PNG/JPEG | `1242×2688` or `1284×2778` |
| iPad 13" display | up to 10 | PNG/JPEG | **2048 × 2732** portrait (or `2064×2752`) |

- App Store Connect auto-scales the **6.9" iPhone** + **13" iPad** sets down to the
  smaller device classes, so those two usually suffice. Add a 6.5" set only if the
  console asks for it. (The generator defaults to iPhone 6.9" + iPad 13".)
- **App Previews** (the 15–30 s videos) are a separate upload this skill does not
  produce.
- Point `FEATURES[*].shot` at the `ios-*.png` captures in
  `azula-app/e2e/screenshots/` before running `--platform appstore`.

## Adding another store (Galaxy Store, Amazon Appstore, F-Droid, web, …)

Copy a `PLATFORMS` entry in `scripts/gen.py`, set `icon.size`, `feature`
({w,h} or `None`), and `groups` (`name`, `tmpl` `portrait`|`landscape`, `w`, `h`),
then record the store's real spec in a new section here.
