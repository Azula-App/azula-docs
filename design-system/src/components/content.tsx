import type { ReactNode } from "react";

export interface InlineCodeProps {
  children: ReactNode;
}

/**
 * Inline code: mono on the code surface with a hairline border at `rXs`,
 * pink-light text.
 */
export function InlineCode({ children }: InlineCodeProps) {
  return <code className="az-code-inline">{children}</code>;
}

export interface CodeBlockProps {
  /** The code text. Rendered in a `pre` — whitespace is preserved. */
  children: ReactNode;
}

/**
 * A code block: `bg`-filled pre with a hairline border at `rMd`, mono 12px
 * in the code text color.
 */
export function CodeBlock({ children }: CodeBlockProps) {
  return (
    <pre className="az-code-block">
      <code>{children}</code>
    </pre>
  );
}

export interface CodeboxProps {
  /** Pink-light mono key label, e.g. "session". */
  label?: ReactNode;
  /** The value — a code, fingerprint or command. */
  children: ReactNode;
}

/**
 * A key/value code row on the subtle surface: the share-code idiom. Label in
 * pink-light mono, value in mono body text; long values break anywhere.
 */
export function Codebox({ label, children }: CodeboxProps) {
  return (
    <div className="az-codebox">
      {label != null && <span className="az-codebox__k">{label}</span>}
      <span className="az-codebox__v">{children}</span>
    </div>
  );
}

export interface DividerProps {
  /** Default `horizontal`. Vertical dividers stretch to their row's height. */
  axis?: "horizontal" | "vertical";
}

/**
 * A 1px hairline rule in `outlineSoft`, horizontal or vertical.
 */
export function Divider({ axis = "horizontal" }: DividerProps) {
  return <div className={axis === "vertical" ? "az-divider--v" : "az-divider--h"} />;
}

export interface TableProps {
  /** Column headers — rendered as tracked uppercase mono. */
  head: ReactNode[];
  /** Row cells. The first column renders bright with no wrapping. */
  rows: ReactNode[][];
}

/**
 * azula's data table: uppercase tracked mono headers, hairline row rules,
 * first column bright, the rest dim.
 */
export function Table({ head, rows }: TableProps) {
  return (
    <table className="az-table">
      <thead>
        <tr>
          {head.map((h, i) => (
            <th key={i}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map((c, j) => (
              <td key={j}>{c}</td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A terminal line: a plain string is output; `{ cmd }` renders with the green `›` prompt. */
export type TerminalLine = string | { cmd: string };

export interface TerminalProps {
  lines: TerminalLine[];
}

/**
 * A terminal block: `bg` fill, hairline border, mono 12px at 1.7 leading.
 * Output is terminal green (`termText`); command lines get the `›` prompt in
 * `termPrompt` with the command in high-contrast text.
 */
export function Terminal({ lines }: TerminalProps) {
  return (
    <div className="az-terminal">
      {lines.map((l, i) =>
        typeof l === "string" ? (
          <div key={i} className="az-terminal__line">
            {l}
          </div>
        ) : (
          <div key={i} className="az-terminal__line az-terminal__line--cmd">
            <span className="az-terminal__prompt">›</span>
            {l.cmd}
          </div>
        ),
      )}
    </div>
  );
}

export interface MessageBubbleProps {
  /** `me` — magenta gradient, right-aligned. `them` — message surface, left. */
  from: "me" | "them";
  children: ReactNode;
  /** Optional micro mono timestamp under the text. */
  time?: string;
}

/**
 * A chat bubble with azula's asymmetric "tail" corners (15/15/5/15 for me,
 * 15/15/15/5 for them). Mine fills with the primary gradient; theirs sits on
 * the message surface with a faint border.
 */
export function MessageBubble({ from, children, time }: MessageBubbleProps) {
  return (
    <div className="az-bubble-row">
      <div className={`az-bubble az-bubble--${from}`}>
        {children}
        {time && <span className="az-bubble__time">{time}</span>}
      </div>
    </div>
  );
}

export interface StatusDotProps {
  /** Status tone. Default `success`. */
  tone?: "success" | "warning" | "danger" | "accent" | "neutral";
  /** Live pulse — success brightens to `successBright` with the green glow. */
  pulse?: boolean;
}

/**
 * An 8px status dot. `pulse` marks a live/active state and is the only
 * sanctioned use of `successBright`.
 */
export function StatusDot({ tone = "success", pulse }: StatusDotProps) {
  return <span className={`az-dot az-dot--${tone}${pulse ? " az-dot--pulse" : ""}`} />;
}

/** The A2UI line-icon vocabulary. */
export type IconName = "bolt" | "terminal" | "lock" | "link" | "chat" | "controls";

export interface IconProps {
  name: IconName;
  /** Square size in px. Default 24. */
  size?: number;
}

/**
 * azula's line icons (the A2UI set): 24px, 2px stroke, inheriting the
 * current text color. `bolt` is the one filled glyph.
 */
export function Icon({ name, size = 24 }: IconProps) {
  const stroke = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const body = {
    bolt: <path d="M13 2 L4 14 h6 l-1 8 l9-12 h-6 z" fill="currentColor" />,
    terminal: (
      <g {...stroke}>
        <polyline points="4 6 9 12 4 18" />
        <line x1="12" y1="18" x2="20" y2="18" />
      </g>
    ),
    lock: (
      <g {...stroke}>
        <rect x="4" y="10" width="16" height="11" rx="2" />
        <path d="M8 10 V7 a4 4 0 0 1 8 0 v3" />
      </g>
    ),
    link: (
      <g {...stroke}>
        <circle cx="7" cy="8" r="3" />
        <circle cx="17" cy="16" r="3" />
        <line x1="9" y1="10" x2="15" y2="14" />
      </g>
    ),
    chat: (
      <g {...stroke}>
        <path d="M4 5 h16 a1 1 0 0 1 1 1 v9 a1 1 0 0 1 -1 1 H10 l-5 4 v-4 H4 a1 1 0 0 1 -1 -1 V6 a1 1 0 0 1 1 -1 z" />
      </g>
    ),
    controls: (
      <g fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
        <line x1="4" y1="8" x2="20" y2="8" />
        <circle cx="15" cy="8" r="2.4" fill="var(--surface)" />
        <line x1="4" y1="16" x2="20" y2="16" />
        <circle cx="9" cy="16" r="2.4" fill="var(--surface)" />
      </g>
    ),
  }[name];
  return (
    <svg className="az-icon" width={size} height={size} viewBox="0 0 24 24" aria-label={name}>
      {body}
    </svg>
  );
}

export interface AudioBarProps {
  /** Played fraction 0–1. Default 0.25. */
  progress?: number;
  /** Elapsed/duration readout, e.g. "0:12 / 0:48". */
  time?: string;
  onPlay?: () => void;
}

/**
 * The chat audio bar: gradient play button with the medium glow, a 42-bar
 * waveform where played bars light magenta, and a mono time readout.
 */
export function AudioBar({ progress = 0.25, time = "0:12 / 0:48", onPlay }: AudioBarProps) {
  const bars = Array.from({ length: 42 }, (_, i) => ({
    h: 6 + Math.abs(Math.sin(i * 0.9)) * 22,
    played: i / 42 < progress,
  }));
  return (
    <div className="az-audio">
      <button className="az-audio__play" onClick={onPlay} aria-label="Play">
        <span
          style={{
            width: 0,
            height: 0,
            borderLeft: "11px solid #fff",
            borderTop: "7px solid transparent",
            borderBottom: "7px solid transparent",
            marginLeft: 3,
          }}
        />
      </button>
      <div className="az-audio__wave">
        {bars.map((b, i) => (
          <span
            key={i}
            className={`az-audio__bar${b.played ? " az-audio__bar--played" : ""}`}
            style={{ height: Math.round(b.h) }}
          />
        ))}
      </div>
      <span className="az-audio__time">{time}</span>
    </div>
  );
}
