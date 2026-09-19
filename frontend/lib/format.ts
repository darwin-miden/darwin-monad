export const LOCALE = "en-US";

const dayFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", timeZone: "UTC" });
const dayYearFormat = new Intl.DateTimeFormat(LOCALE, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC" });
const compact = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 2 });
const compactTight = new Intl.NumberFormat(LOCALE, { notation: "compact", maximumFractionDigits: 1 });

export const calendarDay = (t: number) => dayFormat.format(t);
export const calendarDayYear = (t: number) => dayYearFormat.format(t);
export const compactNumber = (n: number) => compact.format(n);
export const compactNumberTight = (n: number) => compactTight.format(n);
export const intradayStamp = (t: number) => `${dayFormat.format(t)}, ${timeFormat.format(t)} UTC`;
export const localMoment = (t: number) =>
  new Date(t).toLocaleString(LOCALE, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

const plain = (n: number, digits: number) => n.toLocaleString(LOCALE, { maximumFractionDigits: digits, useGrouping: false });

export const pct = (n: number) => `${(100 * n).toFixed(1)}%`;

export const portfolioUsd = (n: number) =>
  `$${(Number.isFinite(n) ? n : 0).toLocaleString(LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function qty(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "0";
  const abs = Math.abs(n);
  if (abs >= 1e3) return n.toLocaleString(LOCALE, { maximumFractionDigits: 2 });
  if (abs >= 1) return n.toFixed(4);
  if (abs >= 1e-8) return plain(n, 8);
  return n > 0 ? "<0.00000001" : ">-0.00000001";
}

export function usd(n: number): string {
  if (!Number.isFinite(n) || n === 0) return "$0.00";
  const abs = Math.abs(n);
  if (abs >= 1e3) return `$${n.toLocaleString(LOCALE, { maximumFractionDigits: 0 })}`;
  if (abs >= 1) return `$${n.toFixed(2)}`;
  if (abs >= 1e-4) return `$${n.toFixed(6)}`;
  if (abs >= 1e-8) return `$${plain(n, 8)}`;
  return n > 0 ? "<$0.00000001" : ">-$0.00000001";
}

/** 0x1234…abcd */
export const short = (address: string) => `${address.slice(0, 6)}…${address.slice(-4)}`;
