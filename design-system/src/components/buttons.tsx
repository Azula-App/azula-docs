import type { MouseEventHandler, ReactNode } from "react";

export interface ButtonProps {
  /**
   * `primary` — magenta gradient + glow, the one CTA per view.
   * `default` — filled input-surface control.
   * `ghost` — transparent with hairline border.
   * `borderless` — text-only, pink-light label.
   */
  variant?: "primary" | "default" | "ghost" | "borderless";
  /** Optional leading icon (usually an `Icon`). */
  icon?: ReactNode;
  disabled?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  children: ReactNode;
  type?: "button" | "submit";
}

/**
 * azula's button. Primary uses the `primaryBrush` gradient with white ink and
 * the signature magenta glow; the rest are quiet hairline-bordered or
 * borderless controls. Weight 600, radius `rMd`.
 */
export function Button({
  variant = "default",
  icon,
  disabled,
  onClick,
  children,
  type = "button",
}: ButtonProps) {
  return (
    <button
      type={type}
      className={`az-btn az-btn--${variant}`}
      disabled={disabled}
      onClick={onClick}
    >
      {icon}
      {children}
    </button>
  );
}
