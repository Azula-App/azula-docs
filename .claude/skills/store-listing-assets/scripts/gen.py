#!/usr/bin/env python3
"""azula store-listing asset generator — neon-glass design language.

Renders the three kinds of store-listing graphics at each store's *exact*
required pixel size / aspect ratio:

  • app icon          — the full-bleed opaque `>a` mark (store applies its own mask)
  • feature / promo   — a wide banner (wordmark + tagline + peeking device)
  • marketing shots   — real in-app captures framed on a branded background
                        with a headline (portrait for phones, landscape for tablets)

Everything is drawn as an SVG (full control of glow filters + type) and rasterised
with Inkscape, so output is crisp at any resolution.

Usage:
    python3 gen.py --platform play
    python3 gen.py --platform appstore --shots-glob 'ios-*'
    python3 gen.py --platform play --out ~/Downloads/azula-play-assets

Requires: inkscape, imagemagick (`magick`), python3, and JetBrains Mono installed
so fontconfig can find it (repo copy: azula-app/theme/composeResources/font/).

Edit FEATURES below to change which screenshots are used and the marketing copy;
edit / add a PLATFORMS entry to target a new store. See ../SKILL.md.
"""
import argparse, base64, html, os, subprocess, sys

# ── azula brand tokens (neon-glass). Source of truth: azula-app/theme/.../Color.kt
#    + AzulaColors in a2ui, documented in azula-docs/docs/a2ui.md ───────────────
BG      = "#070709"   # base background
PINK    = "#ff2d9b"   # primary accent
GREEN   = "#52c98a"   # secondary accent (the `>` prompt)
WHITE   = "#f3eef1"   # bright content
MUTED   = "#8a8a9a"   # muted subtext
MONO    = "JetBrains Mono, monospace"   # the brand typeface
EM      = 0.62        # JetBrains Mono advance width per char (for auto-fit)

# ── Marketing beats. One entry == one screenshot in every phone/tablet group.
#    head: tuple alternating (normal, ACCENT, normal, ACCENT, …) — accents render pink.
#    sub:  list of pre-wrapped lines (SVG doesn't auto-wrap).
#    shot: filename inside --shots (swap android-*.png → ios-*.png for iOS, etc.)
#    Pick shots that are clean and self-explanatory; AVOID ones containing debug/
#    "mock" text or blank/keyboard-covered states.
FEATURES = [
    dict(shot="android-home-2.png",
         head=("your world, ", "peer to peer"),
         sub=["direct device-to-device over iroh —", "no server in the middle"]),
    dict(shot="android-azula-chat.png",
         head=("your ", "llm", ", always on"),
         sub=["ask anything. azula answers", "right inside the thread."]),
    dict(shot="android-dice-widget.png",
         head=("just say ", "“play a game”"),
         sub=["azula builds a mini-app", "in the chat, live."]),
    dict(shot="android-terminal-help.png",
         head=("share a real ", "terminal"),
         sub=["drive an encrypted shell together,", "in real time."]),
]

FEATURE_TAGLINE = ("your llm, always on", "chat · terminal · games — peer to peer")

# ── Per-store output plan. Add a store by copying an entry and fixing the sizes.
#    ALWAYS verify sizes against the live store console — they change over time
#    (see ../references/store-specs.md). aspect must be 16:9 or 9:16 where required.
#    tmpl: "portrait" (headline on top, device below) | "landscape" (headline left,
#    device right). icon.size is a square px; feature is a {w,h} banner or None.
PLATFORMS = {
    "play": {
        "icon":    {"size": 512},
        "feature": {"w": 1024, "h": 500},
        "groups": [
            {"name": "phone",       "tmpl": "portrait",  "w": 1080, "h": 1920},
            {"name": "tablet-7in",  "tmpl": "landscape", "w": 1920, "h": 1080},
            {"name": "tablet-10in", "tmpl": "landscape", "w": 2560, "h": 1440},
            {"name": "chromebook",  "tmpl": "landscape", "w": 2560, "h": 1440},
        ],
    },
    # Apple App Store Connect. No "feature graphic"; the 1024 marketing icon is
    # uploaded separately. Sizes below are the safe current defaults — CONFIRM in
    # App Store Connect before submitting (Apple rotates accepted display sizes).
    "appstore": {
        "icon":    {"size": 1024},
        "feature": None,
        "groups": [
            {"name": "iphone-6.9", "tmpl": "portrait", "w": 1290, "h": 2796},
            {"name": "ipad-13",    "tmpl": "portrait", "w": 2048, "h": 2732},
        ],
    },
}

# ── paths (default to this repo checkout; override with flags) ────────────────
HERE = os.path.dirname(os.path.abspath(__file__))
DEFAULT_REPO = os.path.abspath(os.path.join(HERE, "..", "..", "..", "..", ".."))  # → azula/

def esc(s): return html.escape(s, quote=True)

def imgsize(path):
    w, h = subprocess.check_output(["magick", "identify", "-format", "%w %h", path]).decode().split()
    return int(w), int(h)

def b64(path):
    with open(path, "rb") as f:
        return base64.b64encode(f.read()).decode()

def fit_fs(text_len, avail_w, base):
    """Largest font size (≤ base) that fits `text_len` mono chars in `avail_w`."""
    return int(min(base, avail_w / (EM * max(1, text_len))))

def defs(w, h, cx, cy, r=0.7, pink_op=0.17, green=True):
    gg = f'''
      <radialGradient id="gg" cx="4%" cy="94%" r="55%">
        <stop offset="0%" stop-color="{GREEN}" stop-opacity="0.10"/>
        <stop offset="100%" stop-color="{GREEN}" stop-opacity="0"/>
      </radialGradient>''' if green else ""
    gr = f'<rect width="{w}" height="{h}" fill="url(#gg)"/>' if green else ""
    blur = max(10, int(min(w, h) * 0.02))
    return f'''<defs>
      <radialGradient id="depth" cx="{cx*100:.1f}%" cy="{cy*100:.1f}%" r="{r*100:.0f}%">
        <stop offset="0%" stop-color="{PINK}" stop-opacity="{pink_op}"/>
        <stop offset="100%" stop-color="{PINK}" stop-opacity="0"/>
      </radialGradient>{gg}
      <pattern id="scan" width="4" height="3" patternUnits="userSpaceOnUse">
        <rect width="4" height="1" fill="#ffffff" opacity="0.014"/>
      </pattern>
      <filter id="devglow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="{blur}"/>
      </filter>
    </defs>
    <rect width="{w}" height="{h}" fill="{BG}"/>
    <rect width="{w}" height="{h}" fill="url(#depth)"/>
    {gr}
    <rect width="{w}" height="{h}" fill="url(#scan)"/>'''

def device(shot_path, dx, dy, dw, dh, rad):
    data = b64(shot_path)
    cid = f"clip{dx}_{dy}"
    return f'''
    <rect x="{dx}" y="{dy}" width="{dw}" height="{dh}" rx="{rad}" ry="{rad}"
          fill="{PINK}" opacity="0.28" filter="url(#devglow)"/>
    <clipPath id="{cid}"><rect x="{dx}" y="{dy}" width="{dw}" height="{dh}" rx="{rad}" ry="{rad}"/></clipPath>
    <image href="data:image/png;base64,{data}" x="{dx}" y="{dy}" width="{dw}" height="{dh}"
           preserveAspectRatio="xMidYMid slice" clip-path="url(#{cid})"/>
    <rect x="{dx}" y="{dy}" width="{dw}" height="{dh}" rx="{rad}" ry="{rad}"
          fill="none" stroke="{PINK}" stroke-opacity="0.30" stroke-width="{max(1.5, dw*0.004):.1f}"/>'''

def head_tspans(parts):
    return "".join(
        f'<tspan fill="{PINK if i%2 else WHITE}">{esc(p)}</tspan>'
        for i, p in enumerate(parts))

def render(svg, outpath, w, h):
    svgpath = outpath.replace(".png", ".svg")
    with open(svgpath, "w") as f:
        f.write(svg)
    subprocess.run(["inkscape", svgpath, "--export-type=png",
                    f"--export-filename={outpath}", "-w", str(w), "-h", str(h)],
                   check=True, capture_output=True)
    os.remove(svgpath)

# ── icon ─────────────────────────────────────────────────────────────────────
def icon(src, size, outpath):
    if src.lower().endswith(".svg"):
        subprocess.run(["inkscape", src, "--export-type=png",
                        f"--export-filename={outpath}", "-w", str(size), "-h", str(size)],
                       check=True, capture_output=True)
    else:  # raster source → high-quality resize
        subprocess.run(["magick", src, "-resize", f"{size}x{size}", outpath], check=True)
    # flatten to opaque so the store's own mask/shadow has a clean base
    subprocess.run(["magick", outpath, "-background", BG, "-alpha", "remove", "-alpha", "off", outpath], check=True)

# ── portrait template (phones) ───────────────────────────────────────────────
def portrait(feat, shots, w, h, outpath):
    m = int(w * 0.075)
    hlen = 2 + sum(len(p) for p in feat["head"])           # "> " + parts
    head_fs = fit_fs(hlen, w - 2*m, int(w * 0.062))
    sub_fs = int(w * 0.030)
    hy = int(h * 0.085)
    top, bottom_m = int(h * 0.185), int(h * 0.055)
    avail = h - top - bottom_m
    sw, sh = imgsize(os.path.join(shots, feat["shot"]))
    ar = sw / sh
    dh = avail; dw = int(dh * ar)
    if dw > w - 2*m:
        dw = w - 2*m; dh = int(dw / ar)
    dx = (w - dw)//2; dy = top + (avail - dh)//2
    rad = int(dw * 0.055)
    subt = "".join(f'<tspan x="{w/2}" dy="{0 if i==0 else sub_fs*1.5:.0f}">{esc(l)}</tspan>'
                   for i, l in enumerate(feat["sub"]))
    hl = f'<tspan fill="{GREEN}">› </tspan>' + head_tspans(feat["head"])
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
    {defs(w,h,0.5,0.30, r=0.72, pink_op=0.18)}
    <text x="{w/2}" y="{hy}" font-family="{MONO}" font-weight="700" font-size="{head_fs}" text-anchor="middle" letter-spacing="-1" xml:space="preserve">{hl}</text>
    <text x="{w/2}" y="{hy+head_fs*0.95:.0f}" font-family="{MONO}" font-weight="400" font-size="{sub_fs}" text-anchor="middle" fill="{MUTED}">{subt}</text>
    {device(os.path.join(shots,feat["shot"]), dx,dy,dw,dh,rad)}
    </svg>'''
    render(svg, outpath, w, h)

# ── landscape template (tablets / chromebook / desktop) ──────────────────────
def landscape(feat, shots, w, h, outpath):
    m = int(w * 0.055)
    dev_h = int(h * 0.82)
    sw, sh = imgsize(os.path.join(shots, feat["shot"]))
    ar = sw / sh
    dw = int(dev_h * ar); dh = dev_h
    dx = int(w - m - dw); dy = (h - dh)//2
    rad = int(dw * 0.05)
    lx = m
    colw = dx - lx - int(w * 0.04)
    wordmark_fs = int(h * 0.052)
    head_fs = fit_fs(sum(len(p) for p in feat["head"]), colw, int(h * 0.086))
    sub_fs = fit_fs(max(len(l) for l in feat["sub"]), colw, int(h * 0.040))
    cy = h * 0.44
    subt = "".join(f'<tspan x="{lx}" dy="{0 if i==0 else sub_fs*1.55:.0f}">{esc(l)}</tspan>'
                   for i, l in enumerate(feat["sub"]))
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
    {defs(w,h,0.72,0.5, r=0.7, pink_op=0.17)}
    <text x="{lx}" y="{h*0.20:.0f}" font-family="{MONO}" font-weight="700" font-size="{wordmark_fs}" letter-spacing="1" xml:space="preserve"><tspan fill="{GREEN}">› </tspan><tspan fill="{PINK}">azula</tspan></text>
    <text x="{lx}" y="{cy:.0f}" font-family="{MONO}" font-weight="700" font-size="{head_fs}" letter-spacing="-1.5" xml:space="preserve">{head_tspans(feat["head"])}</text>
    <text x="{lx}" y="{cy+head_fs*1.05:.0f}" font-family="{MONO}" font-weight="400" font-size="{sub_fs}" fill="{MUTED}">{subt}</text>
    {device(os.path.join(shots,feat["shot"]), dx,dy,dw,dh,rad)}
    </svg>'''
    render(svg, outpath, w, h)

# ── feature / promo banner ───────────────────────────────────────────────────
def feature_graphic(icon_png, shots, hero, w, h, outpath):
    idata = b64(icon_png)
    shot = os.path.join(shots, hero)
    sw, sh = imgsize(shot); ar = sw / sh
    dh = int(h * 0.90); dw = int(dh * ar)
    dx = int(w * 0.70); dy = (h - dh)//2
    rad = int(dw * 0.07)
    lx = int(w * 0.065)
    isz = int(h * 0.19)
    t1, t2 = FEATURE_TAGLINE
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
    {defs(w,h,0.30,0.45, r=0.8, pink_op=0.20)}
    <clipPath id="icc"><rect x="{lx}" y="{h*0.20:.0f}" width="{isz}" height="{isz}" rx="{isz*0.23:.0f}"/></clipPath>
    <rect x="{lx}" y="{h*0.20:.0f}" width="{isz}" height="{isz}" rx="{isz*0.23:.0f}" fill="{PINK}" opacity="0.30" filter="url(#devglow)"/>
    <image href="data:image/png;base64,{idata}" x="{lx}" y="{h*0.20:.0f}" width="{isz}" height="{isz}" clip-path="url(#icc)"/>
    <text x="{lx+isz+24}" y="{h*0.335:.0f}" font-family="{MONO}" font-weight="700" font-size="{h*0.15:.0f}" letter-spacing="-1" xml:space="preserve"><tspan fill="{GREEN}">› </tspan><tspan fill="{PINK}">azula</tspan></text>
    <text x="{lx}" y="{h*0.66:.0f}" font-family="{MONO}" font-weight="700" font-size="{h*0.08:.0f}" fill="{WHITE}" letter-spacing="-1">{esc(t1)}</text>
    <text x="{lx}" y="{h*0.79:.0f}" font-family="{MONO}" font-weight="400" font-size="{h*0.05:.0f}" fill="{MUTED}">{esc(t2)}</text>
    {device(shot, dx,dy,dw,dh,rad)}
    </svg>'''
    render(svg, outpath, w, h)

# ── driver ───────────────────────────────────────────────────────────────────
def main():
    ap = argparse.ArgumentParser(description="Generate azula store-listing assets.")
    ap.add_argument("--platform", required=True, choices=sorted(PLATFORMS))
    ap.add_argument("--repo", default=DEFAULT_REPO, help="azula parent checkout (default: inferred)")
    ap.add_argument("--shots", help="dir of source screenshots (default: <repo>/azula-app/e2e/screenshots)")
    ap.add_argument("--icon-src", help="icon SVG/PNG source (default: <repo>/azula-app/design/icon/icon.square.svg)")
    ap.add_argument("--out", help="output dir (default: ~/Downloads/azula-<platform>-assets)")
    a = ap.parse_args()

    shots = a.shots or os.path.join(a.repo, "azula-app/e2e/screenshots")
    icon_src = a.icon_src or os.path.join(a.repo, "azula-app/design/icon/icon.square.svg")
    out = os.path.expanduser(a.out or f"~/Downloads/azula-{a.platform}-assets")
    spec = PLATFORMS[a.platform]

    os.makedirs(out, exist_ok=True)
    icon_dir = os.path.join(out, "app-icon"); os.makedirs(icon_dir, exist_ok=True)
    icon_png = os.path.join(icon_dir, f"app-icon-{spec['icon']['size']}.png")
    icon(icon_src, spec["icon"]["size"], icon_png)
    print("icon:", icon_png)

    if spec.get("feature"):
        fdir = os.path.join(out, "feature-graphic"); os.makedirs(fdir, exist_ok=True)
        fw, fh = spec["feature"]["w"], spec["feature"]["h"]
        fp = os.path.join(fdir, f"feature-graphic-{fw}x{fh}.png")
        feature_graphic(icon_png, shots, FEATURES[0]["shot"], fw, fh, fp)
        print("feature:", fp)

    for g in spec["groups"]:
        gdir = os.path.join(out, g["name"]); os.makedirs(gdir, exist_ok=True)
        fn = portrait if g["tmpl"] == "portrait" else landscape
        for i, feat in enumerate(FEATURES, 1):
            op = os.path.join(gdir, f"{i:02d}.png")
            fn(feat, shots, g["w"], g["h"], op)
        print(f"{g['name']}: {len(FEATURES)} × {g['w']}x{g['h']} ({g['tmpl']})")

    # validate every output's real dimensions + size
    print("\nvalidation:")
    for root, _, files in os.walk(out):
        for f in sorted(files):
            if f.endswith(".png"):
                p = os.path.join(root, f)
                w, h = imgsize(p)
                mb = os.path.getsize(p) / 1e6
                print(f"  {os.path.relpath(p, out):40s} {w}x{h}  {mb:.2f} MB")
    print(f"\ndone → {out}")

if __name__ == "__main__":
    main()
