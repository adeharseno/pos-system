"use client";

import {
  useRef,
  useState,
  type ChangeEvent,
  type ComponentProps,
  type ReactNode,
} from "react";

type RupiahInputProps = Omit<
  ComponentProps<"input">,
  "type" | "value" | "defaultValue" | "onChange" | "prefix"
> & {
  /** Controlled value in rupiah (integer). Use together with onValueChange. */
  value?: number | string | null;
  /** Initial value in rupiah (integer) for uncontrolled usage. */
  defaultValue?: number | string | null;
  /** Called with the numeric value (null when the field is empty). */
  onValueChange?: (value: number | null) => void;
  /** Text shown before the input. Set to null to hide it. */
  prefix?: ReactNode;
  error?: boolean;
  wrapperClassName?: string;
};

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

function groupDigits(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function toDigits(value: number | string | null | undefined): string {
  if (value === null || value === undefined) return "";
  return onlyDigits(String(value));
}

/**
 * Rupiah amount input.
 *
 * Digits are grouped automatically while typing, so `100000000` becomes
 * `100.000.000`. The visible input is display-only; when `name` is provided a
 * hidden input submits the raw numeric value (e.g. `100000000`) so existing
 * form actions keep receiving the same value as before.
 */
export function RupiahInput({
  value,
  defaultValue,
  onValueChange,
  prefix = "Rp",
  error,
  className,
  wrapperClassName,
  name,
  required,
  disabled,
  placeholder,
  ...props
}: RupiahInputProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const controlled = value !== undefined;
  const [raw, setRaw] = useState(() => toDigits(defaultValue));
  const digits = controlled ? toDigits(value) : raw;
  const display = groupDigits(digits);

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const element = event.target;
    const caret = element.selectionStart ?? element.value.length;
    const digitsBeforeCaret = onlyDigits(element.value.slice(0, caret)).length;
    const next = onlyDigits(element.value);

    if (!controlled) setRaw(next);
    onValueChange?.(next === "" ? null : Number(next));

    // Re-position the caret after the dots are re-inserted.
    requestAnimationFrame(() => {
      const node = inputRef.current;
      if (!node) return;
      let position = 0;
      let seen = 0;
      while (position < node.value.length && seen < digitsBeforeCaret) {
        if (/\d/.test(node.value[position])) seen += 1;
        position += 1;
      }
      node.setSelectionRange(position, position);
    });
  };

  return (
    <div
      className={[
        "flex min-h-13 w-full items-center gap-2 rounded-lg border bg-[var(--surface)] px-4 text-base shadow-theme-xs transition focus-within:border-brand-300 focus-within:ring-3 focus-within:ring-brand-500/20",
        error
          ? "border-[var(--danger)] focus-within:ring-red-500/15"
          : "border-[var(--border-strong)]",
        disabled ? "cursor-not-allowed bg-gray-100 opacity-60" : "",
        wrapperClassName,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {prefix === null || prefix === "" ? null : (
        <span aria-hidden="true" className="select-none text-gray-500">
          {prefix}
        </span>
      )}
      <input
        {...props}
        ref={inputRef}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={handleChange}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={error || undefined}
        className={[
          "rupiah-input-field tabular min-w-0 flex-1 border-0 bg-transparent p-0 text-base text-gray-800 outline-none focus:outline-none focus-visible:outline-none placeholder:text-gray-400 disabled:cursor-not-allowed",
          className,
        ]
          .filter(Boolean)
          .join(" ")}
      />
      {name ? <input type="hidden" name={name} value={digits} /> : null}
    </div>
  );
}
