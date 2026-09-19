import { useMemo } from "react";
import { calendarDay } from "./format";
import type { Leg, NavHistory, Range } from "./data/types";

export const RANGES: readonly Range[] = ["7D", "30D", "90D", "1Y"];

const RANGE_DAYS: Record<Range, number> = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 };
const RANGE_POINTS: Record<Range, number> = { "7D": 43, "30D": 31, "90D": 46, "1Y": 74 };
const DAY = 864e5;

const EMPTY: NavHistory = { points: [], change: null, supported: false, loading: false };

function fnv1a(input: string) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x1000193);
  }
  return hash >>> 0;
}

/**
 * Deterministic NAV path for a set of legs, ending at the current NAV.
 * Stands in for indexed price history until the oracle feed is wired up.
 */
export function syntheticNavHistory(legs: Leg[] | undefined, range: Range): NavHistory {
  if (!legs?.length) return EMPTY;
  const nav = legs.reduce((sum, leg) => sum + leg.perShare * Math.max(0, leg.priceUsd ?? 1), 0);
  if (!(nav > 0)) return EMPTY;

  const seed = fnv1a(`${range}:${legs.map((l) => l.symbol.toUpperCase()).sort().join(":")}`);
  const byte = (shift: number) => ((seed >>> shift) & 255) / 255;
  const drift = (byte(0) - 0.42) * 0.34;
  const amp1 = 0.018 + 0.035 * byte(8);
  const amp2 = 0.009 + 0.018 * byte(16);
  const phase = byte(24) * Math.PI * 2;
  const freq = 1.4 + 2.6 * byte(4);
  const curve = (t: number) =>
    Math.max(
      0.2,
      1 + drift * t + amp1 * Math.sin(phase + t * Math.PI * 2 * freq) + amp2 * Math.sin(0.7 * phase + t * Math.PI * 2 * (2.3 * freq)),
    );

  const end = curve(1);
  const count = RANGE_POINTS[range];
  const today = DAY * Math.floor(Date.now() / DAY);
  const span = DAY * RANGE_DAYS[range];
  const points = Array.from({ length: count }, (_, i) => {
    const t = i / (count - 1);
    return [today - span + span * t, (nav * curve(t)) / end] as [number, number];
  });
  return { points, change: nav / points[0][1] - 1, supported: true, loading: false };
}

export function useNavHistory(legs: Leg[] | undefined, range: Range = "30D"): NavHistory {
  return useMemo(() => syntheticNavHistory(legs, range), [legs, range]);
}

export function pathFor(values: number[], width: number, height: number, pad = 4) {
  if (values.length < 2) return { line: "", area: "" };
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  const step = width / (values.length - 1);
  const line = values
    .map((v, i) => `${i ? "L" : "M"}${(i * step).toFixed(1)} ${(pad + (1 - (v - min) / span) * (height - 2 * pad)).toFixed(1)}`)
    .join(" ");
  return { line, area: `${line} L${width} ${height} L0 ${height} Z` };
}

export function axisTicks(points: [number, number][], count = 5) {
  if (points.length < 2) return [];
  const step = (points.length - 1) / (count - 1);
  return Array.from({ length: count }, (_, i) => calendarDay(points[Math.round(i * step)][0]));
}
