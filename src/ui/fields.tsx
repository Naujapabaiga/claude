import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { SWATCHES } from '../model/swatches';
import type { SwatchId } from '../model/types';

const round = (v: number) => Math.round(v * 100) / 100;

export function Field({ label, children }: { label: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children(id)}
    </div>
  );
}

interface NumberFieldProps {
  label: string;
  value: number;
  unit?: string;
  min?: number;
  max?: number;
  step?: number;
  integer?: boolean;
  onChange: (value: number) => void;
}

/** Numeric input that accepts a decimal comma and only commits valid numbers. */
export function NumberField({ label, value, unit = 'mm', min, max, step = 1, integer, onChange }: NumberFieldProps) {
  const [text, setText] = useState(String(round(value)));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(round(value)));
  }, [value]);

  const clamp = (v: number) => {
    let out = integer ? Math.round(v) : v;
    if (min !== undefined) out = Math.max(min, out);
    if (max !== undefined) out = Math.min(max, out);
    return out;
  };

  const commit = (raw: string) => {
    const parsed = Number(raw.replace(',', '.').trim());
    if (raw.trim() !== '' && Number.isFinite(parsed)) onChange(clamp(parsed));
  };

  return (
    <Field label={label}>
      {(id) => (
        <div className="number">
          <input
            id={id}
            type="text"
            inputMode="decimal"
            value={text}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onBlur={() => {
              focused.current = false;
              setText(String(round(value)));
            }}
            onChange={(e) => {
              setText(e.target.value);
              commit(e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
              e.preventDefault();
              const delta = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
              const next = clamp(round(value + delta));
              setText(String(next));
              onChange(next);
            }}
          />
          {unit && <span className="unit">{unit}</span>}
        </div>
      )}
    </Field>
  );
}

export function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      {(id) => <input id={id} type="text" value={value} onChange={(e) => onChange(e.target.value)} />}
    </Field>
  );
}

interface ChoiceProps<T extends string> {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}

export function Choice<T extends string>({ label, value, options, onChange }: ChoiceProps<T>) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="choice" role="group" aria-label={label}>
        {options.map((o) => (
          <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

interface SwatchFieldProps {
  label: string;
  value: SwatchId | null;
  allowNone?: boolean;
  onChange: (value: SwatchId | null) => void;
}

export function SwatchField({ label, value, allowNone, onChange }: SwatchFieldProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      <div className="swatches" role="group" aria-label={label}>
        {allowNone && (
          <button
            type="button"
            className="swatch none"
            aria-pressed={value === null}
            aria-label="None (unprinted)"
            title="None (unprinted)"
            onClick={() => onChange(null)}
          />
        )}
        {SWATCHES.map((s) => (
          <button
            key={s.id}
            type="button"
            className="swatch"
            style={{ background: s.rgb }}
            aria-pressed={s.id === value}
            aria-label={s.name}
            title={s.name}
            onClick={() => onChange(s.id)}
          />
        ))}
      </div>
    </div>
  );
}
