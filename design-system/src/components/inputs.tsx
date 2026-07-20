import { useId } from "react";
import type { ReactNode } from "react";

export interface TextFieldProps {
  /**
   * `shortText` (default) — single line. `longText` — textarea.
   * `number` — numeric. `obscured` — password.
   */
  kind?: "shortText" | "longText" | "number" | "obscured";
  /** Mono caption label above the field. */
  label?: ReactNode;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
}

/**
 * azula's text input: input-surface fill, hairline border, mono text at
 * `rMd`. Focus tints the border with `primaryEdge`. Values are
 * machine-adjacent, so the field text is always mono.
 */
export function TextField({
  kind = "shortText",
  label,
  value,
  defaultValue,
  placeholder,
  onChange,
  disabled,
}: TextFieldProps) {
  const id = useId();
  const common = {
    id,
    className: "az-input",
    placeholder,
    disabled,
    value,
    defaultValue,
    onChange: (e: { target: { value: string } }) => onChange?.(e.target.value),
  };
  return (
    <div className="az-field">
      {label != null && (
        <label className="az-field__label" htmlFor={id}>
          {label}
        </label>
      )}
      {kind === "longText" ? (
        <textarea rows={3} {...common} />
      ) : (
        <input
          type={kind === "number" ? "number" : kind === "obscured" ? "password" : "text"}
          {...common}
        />
      )}
    </div>
  );
}

export interface CheckboxProps {
  checked: boolean;
  onChange?: (checked: boolean) => void;
  /** Label to the right of the box. */
  label?: ReactNode;
  disabled?: boolean;
}

/**
 * A rounded checkbox that fills flat `primary` when checked, with the tick in
 * near-black ink (`onPrimaryInk` — ink on flat primary is dark, not white).
 */
export function Checkbox({ checked, onChange, label, disabled }: CheckboxProps) {
  return (
    <label className={`az-check${checked ? " az-check--on" : ""}`} style={disabled ? { opacity: 0.45 } : undefined}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange?.(e.target.checked)}
      />
      <span className="az-check__box">{checked ? "✓" : ""}</span>
      {label != null && <span className="az-check__label">{label}</span>}
    </label>
  );
}

export interface RadioOption {
  value: string;
  label: ReactNode;
  /** Optional right-aligned mono detail, e.g. an RTT. */
  detail?: ReactNode;
}

export interface RadioGroupProps {
  options: RadioOption[];
  value?: string;
  onChange?: (value: string) => void;
  /** Group name for the underlying inputs. */
  name?: string;
}

/**
 * A vertical radio list. The selected dot is a magenta ring with a glowing
 * center; details (latency, region) sit right-aligned in mono.
 */
export function RadioGroup({ options, value, onChange, name }: RadioGroupProps) {
  const id = useId();
  return (
    <div className="az-radio-group" role="radiogroup">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <label key={o.value} className={`az-radio${on ? " az-radio--on" : ""}`}>
            <input
              type="radio"
              name={name ?? id}
              checked={on}
              onChange={() => onChange?.(o.value)}
            />
            <span className="az-radio__dot" />
            <span className="az-radio__label">{o.label}</span>
            {o.detail != null && <span className="az-radio__detail">{o.detail}</span>}
          </label>
        );
      })}
    </div>
  );
}

export interface ChipOption {
  value: string;
  label?: ReactNode;
}

export interface ChipGroupProps {
  /** Chips to show. Strings are shorthand for `{value}`. */
  options: (string | ChipOption)[];
  /** Selected values. */
  selected: string[];
  onChange?: (selected: string[]) => void;
  /** When false, selecting a chip deselects the others. Default true. */
  multiple?: boolean;
}

/**
 * Selectable mono pills. Selected chips fill with the 14% magenta
 * `primarySelected` wash, pink border and pink-light label — azula's
 * standard selected/active idiom.
 */
export function ChipGroup({ options, selected, onChange, multiple = true }: ChipGroupProps) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  const toggle = (v: string) => {
    if (multiple) {
      onChange?.(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v]);
    } else {
      onChange?.([v]);
    }
  };
  return (
    <div className="az-chip-group">
      {opts.map((o) => (
        <button
          key={o.value}
          type="button"
          className={`az-chip${selected.includes(o.value) ? " az-chip--on" : ""}`}
          onClick={() => toggle(o.value)}
        >
          {o.label ?? o.value}
        </button>
      ))}
    </div>
  );
}

export interface SliderProps {
  min?: number;
  max?: number;
  step?: number;
  value: number;
  onChange?: (value: number) => void;
  /** Mono label on the left of the header row. */
  label?: ReactNode;
  /** Pink-light mono readout on the right. Defaults to the value. */
  valueText?: string;
}

/**
 * A range slider with a mono label row and a pink-light live readout. The
 * track and thumb take the `primary` accent.
 */
export function Slider({ min = 0, max = 100, step = 1, value, onChange, label, valueText }: SliderProps) {
  return (
    <div className="az-slider">
      {(label != null || valueText != null) && (
        <div className="az-slider__head">
          <span className="az-slider__label">{label}</span>
          <span className="az-slider__value">{valueText ?? String(value)}</span>
        </div>
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange?.(Number(e.target.value))}
      />
    </div>
  );
}

export interface PillProps {
  /** Status tone; sets the text color. Default `success`. */
  tone?: "success" | "warning" | "danger" | "accent" | "neutral";
  children: ReactNode;
}

/**
 * A status pill: 11px mono in a hairline-bordered capsule. The connection
 * badge idiom — "◉ direct · 12ms · e2e".
 */
export function Pill({ tone = "success", children }: PillProps) {
  return <span className={`az-pill az-pill--${tone}`}>{children}</span>;
}
