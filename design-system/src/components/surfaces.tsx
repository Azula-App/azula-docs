import type { ReactNode } from "react";

export interface CardProps {
  /**
   * `raised` — the default raised card (`surfaceRaised` + `outlineSoft` +
   * card shadow). `nested` — transparent with a stronger outline, for a card
   * inside a card. `muted` — quiet panel (`surfaceSubtle` + `outlineSubtle`).
   */
  variant?: "raised" | "nested" | "muted";
  /** Optional card title (16px, 600, warm white). */
  title?: ReactNode;
  children?: ReactNode;
}

/**
 * The three sanctioned azula surface recipes (design.md §7.5): raised card,
 * nested card and muted panel. Fill, border and radius always travel
 * together — never mix a recipe's fill with another's border.
 */
export function Card({ variant = "raised", title, children }: CardProps) {
  return (
    <div className={`az-card--${variant}`}>
      {title != null && <h3 className="az-card__title">{title}</h3>}
      {children}
    </div>
  );
}

export interface GlowHaloProps {
  children?: ReactNode;
}

/**
 * The glow-halo surface: translucent magenta fill fading downward with a
 * `primaryEdge` border. azula's "look here" container — share codes, QR
 * frames, the active invite.
 */
export function GlowHalo({ children }: GlowHaloProps) {
  return <div className="az-glow-halo">{children}</div>;
}

export interface ModalProps {
  /** The modal only renders when true. */
  open: boolean;
  title: ReactNode;
  /** Called on ✕, overlay click, or Escape-equivalent affordances. */
  onClose?: () => void;
  children?: ReactNode;
  /** Action buttons, right-aligned in the footer. */
  actions?: ReactNode;
}

/**
 * A centered glass sheet over a 60% scrim: raised surface at `rXl`, strong
 * outline, the modal shadow paired with the magenta `glowXl`. Desktop centers
 * it; mobile would present it as a sheet.
 */
export function Modal({ open, title, onClose, children, actions }: ModalProps) {
  if (!open) return null;
  return (
    <div className="az-modal-overlay" onClick={onClose}>
      <div className="az-modal" onClick={(e) => e.stopPropagation()}>
        <div className="az-modal__head">
          <h2 className="az-modal__title">{title}</h2>
          <button className="az-modal__close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>
        {children != null && <div className="az-modal__body">{children}</div>}
        {actions != null && <div className="az-modal__actions">{actions}</div>}
      </div>
    </div>
  );
}
