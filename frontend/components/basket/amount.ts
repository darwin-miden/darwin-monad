const DECIMAL = /^\d*(?:\.\d*)?$/;

/** Largest value ≤ `amount` with at most `digits` decimals, trailing zeros trimmed. */
export function maxInputAmount(amount: number, digits = 4) {
  if (!Number.isFinite(amount) || amount <= 0) return "0";
  const scale = 10 ** digits;
  return (Math.floor(amount * scale) / scale).toFixed(digits).replace(/\.?0+$/, "");
}

/** Keeps a free-typed amount numeric with a single dot and at most `digits` decimals. */
export function pruneDecimalInput(value: string, digits = 4) {
  const clean = DECIMAL.test(value) ? value : value.replace(/[^\d.]/g, "");
  const dot = clean.indexOf(".");
  if (dot < 0) return clean;
  const whole = clean.slice(0, dot);
  const fraction = clean.slice(dot + 1).replaceAll(".", "");
  return `${whole}.${fraction.slice(0, digits)}`;
}
