import type { ReactNode } from "react";

type SegmentedProps<T extends string> = {
  options: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  bare?: boolean;
  fill?: boolean;
  format?: (value: T) => ReactNode;
  optionLabel?: (value: T) => string | undefined;
  optionTone?: (value: T) => string | undefined;
  disabled?: (value: T) => boolean;
};

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  bare,
  fill,
  format,
  optionLabel,
  optionTone,
  disabled,
}: SegmentedProps<T>) {
  return (
    <div className={`seg${bare ? " seg-bare" : ""}${fill ? " seg-fill" : ""}`} role="group" aria-label={label}>
      {options.map((option) => (
        <button
          key={option}
          aria-label={optionLabel?.(option)}
          aria-pressed={option === value}
          data-on={option === value || undefined}
          data-tone={optionTone?.(option)}
          disabled={disabled?.(option)}
          onClick={() => onChange(option)}
        >
          {format ? format(option) : option}
        </button>
      ))}
    </div>
  );
}
