import type { CSSProperties, ReactNode } from "react";

export interface ScreenProps {
  /** Page content. */
  children?: ReactNode;
  /** Extra styles merged onto the root. */
  style?: CSSProperties;
  className?: string;
}

/**
 * The app-root ground: near-black radial wash (`appBackground`), default body
 * text color and the UI font. Every azula screen sits on this — put it at the
 * root of a design so the dark ground and magenta wash are present.
 */
export function Screen({ children, style, className }: ScreenProps) {
  return (
    <div className={`az-screen${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

export interface BrandLockupProps {
  /** `lg` is the site-header lockup (30px), `sm` a compact 20px variant. */
  size?: "lg" | "sm";
  /** Show the blinking block cursor after the wordmark. On by default. */
  cursor?: boolean;
  /** Optional mono tagline under the mark, e.g. "p2p over iroh". */
  tagline?: string;
}

/**
 * The azula brand mark: green `›` prompt + magenta `azula`, both JetBrains
 * Mono 700, with the blinking block cursor. The read is "a terminal prompt" —
 * it is the whole identity. Use `lg` for page headers.
 */
export function BrandLockup({ size = "lg", cursor = true, tagline }: BrandLockupProps) {
  const lg = size === "lg";
  const fs = lg ? 30 : 20;
  return (
    <div>
      <div className={`az-brand${lg ? "" : " az-brand--sm"}`} style={{ gap: lg ? 12 : 8 }}>
        <span className="az-brand__prompt" style={{ fontSize: fs }}>
          ›
        </span>
        <span className="az-brand__name" style={{ fontSize: fs }}>
          azula
        </span>
        {cursor && (
          <span
            className="az-brand__cursor"
            style={{ width: lg ? 11 : 8, height: lg ? 24 : 16 }}
          />
        )}
      </div>
      {tagline && <div className="az-brand__tag">{tagline}</div>}
    </div>
  );
}

export interface EyebrowProps {
  /** Optional mono index prefix, e.g. "01". */
  index?: string;
  /** The label text — rendered uppercase, tracked, terminal green. */
  children: ReactNode;
}

/**
 * A section eyebrow: tracked uppercase mono label in terminal green with a
 * fading hairline rule. azula's standard section divider for catalogs,
 * settings groups and marketing sections.
 */
export function Eyebrow({ index, children }: EyebrowProps) {
  return (
    <div className="az-eyebrow">
      <span className="az-eyebrow__label">
        {index ? `${index} · ` : ""}
        {children}
      </span>
      <span className="az-eyebrow__rule" />
    </div>
  );
}

export interface AvatarProps {
  /** Peer name; the first character becomes the glyph. */
  name: string;
  /** Diameter in px. Default 40. */
  size?: number;
}

/**
 * A peer avatar: circular glyph on the magenta glyph gradient
 * (`primary` → `primaryDeep`), first letter in JetBrains Mono 700.
 */
export function Avatar({ name, size = 40 }: AvatarProps) {
  return (
    <span
      className="az-avatar"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.38) }}
      aria-label={name}
    >
      {(name || "?").trim().charAt(0).toLowerCase()}
    </span>
  );
}
