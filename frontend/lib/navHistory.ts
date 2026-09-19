import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { calendarDay } from "./format";
import type { Leg, NavHistory, Range } from "./data/types";

export const RANGES: readonly Range[] = ["7D", "30D", "90D", "1Y"];

const RANGE_DAYS: Record<Range, number> = { "7D": 7, "30D": 30, "90D": 90, "1Y": 365 };
/** Yahoo chart query per range: hourly bars for a week, daily closes beyond. */
const RANGE_QUERY: Record<Range, { range: string; interval: string }> = {
  "7D": { range: "1mo", interval: "1h" },
  "30D": { range: "3mo", interval: "1d" },
  "90D": { range: "6mo", interval: "1d" },
  "1Y": { range: "1y", interval: "1d" },
};
const DAY = 864e5;

const EMPTY: NavHistory = { points: [], change: null, supported: false, loading: false };

type History = { timestamps: number[]; closes: Record<string, number[]>; missing: string[] };

async function fetchHistory(symbols: string[], range: Range): Promise<History> {
  const q = RANGE_QUERY[range];
  const res = await fetch(`/api/history?symbols=${symbols.join(",")}&range=${q.range}&interval=${q.interval}`);
  if (!res.ok) throw new Error(`history ${res.status}`);
  return res.json();
}

/**
 * NAV path for a set of legs. Units per share are fixed, so the historical NAV is exactly
 * the sum of units x each constituent's closing price; the live on-chain NAV is the last point.
 */
export function useNavHistory(legs: Leg[] | undefined, range: Range = "30D"): NavHistory {
  const symbols = useMemo(() => [...new Set((legs ?? []).map((l) => l.symbol.toUpperCase()))].sort(), [legs]);
  const { data, isLoading, dataUpdatedAt } = useQuery({
    queryKey: ["history", symbols.join(","), range],
    queryFn: () => fetchHistory(symbols, range),
    enabled: symbols.length > 0,
    staleTime: 10 * 60_000,
  });

  return useMemo(() => {
    if (!legs?.length) return EMPTY;
    if (isLoading) return { ...EMPTY, loading: true };
    const nav = legs.reduce((sum, leg) => sum + leg.perShare * Math.max(0, leg.priceUsd ?? 0), 0);
    if (!data || !(nav > 0) || legs.some((l) => !data.closes[l.symbol.toUpperCase()])) return EMPTY;

    // Anchor on the fetch time (render must stay pure); the live NAV is stamped at that moment.
    const now = dataUpdatedAt;
    const from = now - DAY * RANGE_DAYS[range];
    const points: [number, number][] = [];
    data.timestamps.forEach((t, i) => {
      if (t * 1000 < from) return;
      points.push([t * 1000, legs.reduce((sum, l) => sum + l.perShare * data.closes[l.symbol.toUpperCase()][i], 0)]);
    });
    points.push([Math.max(now, (points.at(-1)?.[0] ?? 0) + 1), nav]);
    if (points.length < 2) return EMPTY;
    return { points, change: nav / points[0][1] - 1, supported: true, loading: false };
  }, [data, dataUpdatedAt, isLoading, legs, range]);
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
