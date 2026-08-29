import { useState } from 'react';

type Props = {
  label: string;
  /** Secondary label, e.g. the axis a Euler slot rotates about. */
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit?: string;
  /** Accent colour for the label chip — used to tie a row to its axis. */
  color?: string;
};

const format = (value: number): string => {
  if (!Number.isFinite(value)) return '0';
  const rounded = Math.round(value * 1000) / 1000;
  return Object.is(rounded, -0) ? '0' : String(rounded);
};

/**
 * One scalar input: type it, nudge it, or drag it.
 *
 * Three ways in on purpose — a slider is quick but imprecise, steppers are precise but
 * slow, and typing is what you want when you already know the number. On a phone all
 * three beat a scrub-to-change field, which fights the browser's own gestures.
 */
export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  step,
  unit,
  color,
}: Props) {
  // While the text box has focus we hold the raw string, so partial entries like "-" or
  // "1." survive long enough to finish typing.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    setDraft(raw);
    const parsed = Number(raw);
    if (raw.trim() !== '' && Number.isFinite(parsed)) onChange(parsed);
  };

  const nudge = (delta: number) => {
    setDraft(null);
    const next = Math.round((value + delta) * 1e6) / 1e6;
    onChange(Math.min(max, Math.max(min, next)));
  };

  return (
    <div className="field">
      <div className="field__top">
        <span className="field__label" style={color ? { color } : undefined}>
          {label}
          {hint && <span className="field__hint">{hint}</span>}
        </span>
        <div className="field__entry">
          <input
            className="field__input"
            type="text"
            inputMode="decimal"
            aria-label={label}
            value={draft ?? format(value)}
            onChange={(e) => commit(e.target.value)}
            onFocus={(e) => {
              setDraft(format(value));
              e.target.select();
            }}
            onBlur={() => setDraft(null)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
          />
          {unit && <span className="field__unit">{unit}</span>}
        </div>
      </div>

      <div className="field__row">
        <button
          className="field__step"
          type="button"
          aria-label={`Decrease ${label}`}
          onClick={() => nudge(-step)}
        >
          −
        </button>
        <input
          className="field__slider"
          type="range"
          aria-label={`${label} slider`}
          min={min}
          max={max}
          step={step}
          value={Math.min(max, Math.max(min, value))}
          onChange={(e) => {
            setDraft(null);
            onChange(Number(e.target.value));
          }}
        />
        <button
          className="field__step"
          type="button"
          aria-label={`Increase ${label}`}
          onClick={() => nudge(step)}
        >
          +
        </button>
      </div>
    </div>
  );
}
