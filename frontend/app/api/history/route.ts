import { NextResponse, type NextRequest } from "next/server";

const RANGES = new Set(["5d", "1mo", "3mo", "6mo", "1y"]);
const INTERVALS = new Set(["1h", "1d"]);
const SYMBOL_RE = /^[A-Z.]{1,8}$/;

type Series = { timestamps: number[]; closes: (number | null)[] };

async function fetchSeries(symbol: string, range: string, interval: string): Promise<Series | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}?range=${range}&interval=${interval}`;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36" },
      next: { revalidate: interval === "1h" ? 900 : 3600 },
    });
    if (!res.ok) return null;
    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result?.timestamp) return null;
    return { timestamps: result.timestamp as number[], closes: result.indicators?.quote?.[0]?.close ?? [] };
  } catch {
    return null;
  }
}

/**
 * GET /api/history?symbols=AAPL,NVDA&range=3mo&interval=1d
 * Closes aligned on the bars shared by every requested symbol (occasional gaps forward-filled).
 */
export async function GET(req: NextRequest) {
  const params = req.nextUrl.searchParams;
  const range = RANGES.has(params.get("range") ?? "") ? params.get("range")! : "3mo";
  const interval = INTERVALS.has(params.get("interval") ?? "") ? params.get("interval")! : "1d";
  const symbols = [...new Set((params.get("symbols") ?? "").toUpperCase().split(","))].filter((s) => SYMBOL_RE.test(s));
  if (symbols.length === 0 || symbols.length > 32) {
    return NextResponse.json({ error: "symbols required (max 32)" }, { status: 400 });
  }

  const series = await Promise.all(symbols.map((s) => fetchSeries(s, range, interval)));
  const available = symbols.filter((_, i) => series[i] !== null);

  // Bucket bars (daily bars by date, hourly bars by hour) and intersect across symbols.
  const bucket = (t: number) => (interval === "1d" ? Math.floor(t / 86400) * 86400 + 72000 : Math.floor(t / 3600) * 3600);
  const byBar = new Map<number, Record<string, number>>();
  for (const symbol of available) {
    const s = series[symbols.indexOf(symbol)]!;
    let last: number | null = null;
    s.timestamps.forEach((t, i) => {
      const c = s.closes[i] ?? last;
      if (c == null) return;
      last = c;
      const key = bucket(t);
      const row = byBar.get(key) ?? {};
      row[symbol] = c;
      byBar.set(key, row);
    });
  }

  const timestamps = [...byBar.keys()].filter((t) => available.every((s) => byBar.get(t)![s] != null)).sort((a, b) => a - b);
  const closes: Record<string, number[]> = {};
  for (const s of available) closes[s] = timestamps.map((t) => byBar.get(t)![s]);

  return NextResponse.json(
    { range, interval, timestamps, closes, missing: symbols.filter((s) => !available.includes(s)) },
    { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=86400" } },
  );
}
