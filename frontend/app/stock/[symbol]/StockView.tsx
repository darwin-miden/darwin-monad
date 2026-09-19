"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { StockLogo } from "@/components/ui/StockLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { assetSurface } from "@/lib/assetColor";
import { useAssets, useBaskets } from "@/lib/data/store";
import type { Asset, Basket, Leg, Range } from "@/lib/data/types";
import { calendarDayYear, intradayStamp, short, usd } from "@/lib/format";
import { RANGES, syntheticNavHistory } from "@/lib/navHistory";
import { chain } from "@/lib/wallet";
import styles from "./stock.module.css";

const round = (n: number) => Math.round(100 * n) / 100;
const DAY = 864e5;

/** One share of the stock itself, so the basket NAV model yields the asset's price path. */
const pseudoLeg = (asset: Asset): Leg => ({
  address: asset.address,
  symbol: asset.symbol,
  decimals: asset.decimals,
  class: asset.class,
  perShare: 1,
  priceUsd: asset.priceUsd,
  valueUsd: asset.priceUsd,
  weight: 1,
  depthUsd: asset.depthUsd,
});

function RangeTrack({ low, high, value }: { low: number; high: number; value: number }) {
  const left = high > low ? Math.max(2, Math.min(98, ((value - low) / (high - low)) * 100)) : 50;
  return (
    <span className={styles.rangeTrack} aria-hidden>
      <span style={{ left: `${left}%` }} />
    </span>
  );
}

function PriceChart({ symbol, points, range, onRange }: { symbol: string; points: [number, number][]; range: Range; onRange: (r: Range) => void }) {
  const [cursor, setCursor] = useState<number | null>(null);

  const plot = useMemo(() => {
    if (points.length < 2) return null;
    const closes = points.map(([, v]) => v);
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || max || 1;
    const x = (i: number) => 8 + (i / (closes.length - 1)) * 704;
    const y = (v: number) => 8 + (1 - (v - min) / span) * 224;
    return {
      closes,
      line: closes.map((v, i) => `${i ? "L" : "M"}${round(x(i))} ${round(y(v))}`).join(""),
      x,
      y,
      up: closes[closes.length - 1] >= closes[0],
    };
  }, [points]);

  const intraday = points.some((p, i) => i > 0 && p[0] - points[i - 1][0] < DAY);
  const reading =
    cursor !== null && points[cursor]
      ? { price: points[cursor][1], time: intraday ? intradayStamp(points[cursor][0]) : calendarDayYear(points[cursor][0]) }
      : null;
  const stroke = plot?.up ? "var(--color-status-positive)" : "var(--color-status-negative)";
  const helpId = `stock-chart-help-${symbol.toLowerCase()}`;

  return (
    <div className={styles.chartRegion}>
      <div className={styles.chartHeader}>
        <div>
          <span className="t-label">{range} price history</span>
          <div className={styles.chartReading} aria-live="polite">
            {reading && (
              <>
                <strong className="num">{usd(reading.price)}</strong>
                <span>{reading.time}</span>
              </>
            )}
          </div>
        </div>
        <Segmented
          options={RANGES}
          value={range}
          label="Price timeframe"
          bare
          onChange={(r) => {
            onRange(r);
            setCursor(null);
          }}
        />
      </div>
      <div className={styles.chartPlot}>
        {plot ? (
          <>
            <p id={helpId} className={styles.srOnly}>
              Use left and right arrow keys to inspect each recorded price.
            </p>
            <svg
              className={styles.chart}
              viewBox="0 0 720 240"
              preserveAspectRatio="none"
              role="img"
              tabIndex={0}
              aria-describedby={helpId}
              aria-label={reading ? `${symbol} ${range} chart. ${usd(reading.price)} at ${reading.time}` : `${symbol} price over the last ${range}`}
              onFocus={() => setCursor((c) => c ?? plot.closes.length - 1)}
              onBlur={() => setCursor(null)}
              onKeyDown={(event) => {
                let next = cursor ?? plot.closes.length - 1;
                if (event.key === "ArrowLeft") next = Math.max(0, next - 1);
                else if (event.key === "ArrowRight") next = Math.min(plot.closes.length - 1, next + 1);
                else if (event.key === "Home") next = 0;
                else if (event.key === "End") next = plot.closes.length - 1;
                else return;
                event.preventDefault();
                setCursor(next);
              }}
              onPointerMove={(event) => {
                const rect = event.currentTarget.getBoundingClientRect();
                const last = plot.closes.length - 1;
                setCursor(Math.max(0, Math.min(last, Math.round(((event.clientX - rect.left) / rect.width) * last))));
              }}
              onPointerLeave={(event) => {
                if (document.activeElement !== event.currentTarget) setCursor(null);
              }}
            >
              <defs>
                <linearGradient id="stock-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor={stroke} stopOpacity=".16" />
                  <stop offset="1" stopColor={stroke} stopOpacity="0" />
                </linearGradient>
              </defs>
              <path d={`${plot.line}L${round(plot.x(plot.closes.length - 1))} 240L${round(plot.x(0))} 240Z`} fill="url(#stock-fill)" />
              <line x1={8} x2={712} y1={round(plot.y(plot.closes[0]))} y2={round(plot.y(plot.closes[0]))} className={styles.chartOpen} />
              <path
                d={plot.line}
                fill="none"
                stroke={stroke}
                strokeWidth="2"
                vectorEffect="non-scaling-stroke"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {cursor !== null && (
                <>
                  <line x1={round(plot.x(cursor))} x2={round(plot.x(cursor))} y1="0" y2={240} className={styles.chartCross} />
                  <circle
                    cx={round(plot.x(cursor))}
                    cy={round(plot.y(plot.closes[cursor]))}
                    r="5"
                    fill={stroke}
                    stroke="var(--pane)"
                    strokeWidth="3"
                    vectorEffect="non-scaling-stroke"
                  />
                </>
              )}
            </svg>
          </>
        ) : (
          <div className={styles.chartEmpty}>Price history unavailable.</div>
        )}
      </div>
    </div>
  );
}

function CompositionBar({ legs }: { legs: Leg[] }) {
  const weighted = legs.filter((l) => l.weight > 0);
  const total = weighted.reduce((s, l) => s + l.weight, 0);
  const share = (l: Leg) => (total ? l.weight / total : 1 / weighted.length);
  return (
    <div
      className={styles.composition}
      role="img"
      aria-label={weighted.map((l) => `${l.symbol} ${(100 * share(l)).toFixed(1)} percent`).join(", ")}
    >
      {weighted.map((leg) => {
        const pct = 100 * share(leg);
        const surface = assetSurface(leg.symbol);
        const style: CSSProperties = { width: `${pct}%`, background: surface.background, color: surface.foreground };
        return (
          <span key={leg.address} style={style} title={`${leg.symbol} ${pct.toFixed(1)}%`}>
            <b>{leg.symbol}</b>
            <small>{pct.toFixed(pct % 1 ? 1 : 0)}%</small>
          </span>
        );
      })}
    </div>
  );
}

function RelatedRow({ basket }: { basket: Basket }) {
  return (
    <article className={styles.relatedRow}>
      <div className={styles.basketIdentity}>
        <span>
          <b>{basket.name}</b>
          <small>{basket.symbol}</small>
        </span>
      </div>
      <CompositionBar legs={basket.legs} />
      <Link href={`/basket/${basket.address}`} className={styles.openBasket}>
        Open basket <span aria-hidden>→</span>
      </Link>
    </article>
  );
}

export function StockView({ symbol }: { symbol: string }) {
  const { data: assets } = useAssets();
  const { data: baskets } = useBaskets();
  const asset = assets.assets.find((a) => a.symbol.toUpperCase() === symbol);
  const [range, setRange] = useState<Range>("30D");

  const history = useMemo(() => (asset ? syntheticNavHistory([pseudoLeg(asset)], range) : null), [asset, range]);

  const holders = useMemo(
    () =>
      baskets
        .flatMap((basket) => {
          const leg = basket.legs.find((l) => l.symbol === symbol);
          return leg ? [{ basket, backing: basket.tvlUsd * leg.weight }] : [];
        })
        .sort((a, b) => b.backing - a.backing),
    [baskets, symbol],
  );

  const breadcrumb = (
    <nav className={styles.breadcrumb} aria-label="Breadcrumb">
      <Link href="/baskets">Baskets</Link>
      <span aria-hidden>/</span>
      <span>{symbol}</span>
    </nav>
  );

  if (!asset || !history) {
    return (
      <main className="page">
        <div className="wrap">
          {breadcrumb}
          <section className={`card empty ${styles.missing}`}>
            <h1 className="t-h2">{symbol} is not in the asset registry.</h1>
            <p>Only allowlisted stocks can be held by a basket.</p>
            <div className="empty-actions">
              <Link href="/baskets" className="btn btn-ink">
                Browse baskets
              </Link>
            </div>
          </section>
        </div>
      </main>
    );
  }

  const closes = history.points.map(([, v]) => v);
  const low = Math.min(...closes);
  const high = Math.max(...closes);
  const backing = holders.reduce((s, h) => s + h.backing, 0);
  const createHref = `/create?asset=${encodeURIComponent(symbol)}`;

  return (
    <main className="page">
      <div className="wrap">
        {breadcrumb}
        <section className={styles.marketCanvas} aria-labelledby="stock-title">
          <header className={styles.entityHeader}>
            <StockLogo sym={symbol} size={52} />
            <div className={styles.identity}>
              <h1 id="stock-title">{asset.name}</h1>
              <p>
                <span>{symbol}</span>
                <span aria-hidden>·</span>
                <a href={`${chain.blockExplorers.default.url}/address/${asset.address}`} target="_blank" rel="noreferrer" className="mono">
                  {short(asset.address)}
                </a>
              </p>
            </div>
            <div className={styles.primaryQuote}>
              <strong className="num">{usd(asset.priceUsd)}</strong>
              {history.change !== null && (
                <span className={history.change >= 0 ? "c-positive" : "c-negative"}>
                  {history.change >= 0 ? "+" : ""}
                  {(100 * history.change).toFixed(2)}%{" "}
                  <span className="c-muted" style={{ fontWeight: 500 }}>
                    {range}
                  </span>
                </span>
              )}
              <small className={styles.quoteSource}>Oracle price · USDC</small>
            </div>
          </header>
          <div className={styles.marketBody}>
            <PriceChart symbol={symbol} points={history.points} range={range} onRange={setRange} />
            <aside className={styles.marketFacts} aria-label={`${symbol} market facts`}>
              <section>
                <div className={styles.factHeading}>
                  <h2 className="label-row">Price range</h2>
                  <span className={styles.factSource}>{range}</span>
                </div>
                <div className={styles.rangeList}>
                  <div className={styles.rangeItem}>
                    <div>
                      <span>Low – high</span>
                      <b className="num">
                        {usd(low)} – {usd(high)}
                      </b>
                    </div>
                    <RangeTrack low={low} high={high} value={asset.priceUsd} />
                  </div>
                  <div className={styles.simpleFact}>
                    <span>Baskets holding</span>
                    <b className="num">{holders.length}</b>
                  </div>
                  <div className={styles.simpleFact}>
                    <span>Backing in baskets</span>
                    <b className="num">{usd(backing)}</b>
                  </div>
                </div>
              </section>
              <section>
                <div className={styles.factHeading}>
                  <h2 className="label-row">
                    On-chain liquidity
                    <Tooltip term="onChainLiquidity" align="left" />
                  </h2>
                </div>
                <div className={styles.depthTotal}>
                  <span>Deepest route</span>
                  <strong className="num">{usd(asset.depthUsd)}</strong>
                </div>
                <div className={styles.routeList}>
                  <div className={styles.route}>
                    <div>
                      <span>USDC</span>
                      <b className="num">{usd(asset.depthUsd)}</b>
                    </div>
                    <span className={styles.depthTrack} aria-hidden>
                      <span style={{ width: asset.depthUsd > 0 ? "100%" : "0%" }} />
                    </span>
                  </div>
                </div>
              </section>
            </aside>
          </div>
        </section>
        <section className={styles.related} aria-labelledby="related-title">
          <header className={styles.sectionHeader}>
            <h2 id="related-title" className="label-row">
              In baskets
              <Tooltip term="relatedBaskets" align="left" side="bottom" />
            </h2>
            <Link href={createHref} className="btn btn-line btn-sm">
              Create with {symbol}
            </Link>
          </header>
          {holders.length ? (
            <div className={styles.relatedList}>
              {holders.slice(0, 3).map(({ basket }) => (
                <RelatedRow key={basket.address} basket={basket} />
              ))}
            </div>
          ) : (
            <div className={styles.relatedEmpty}>
              <p>No basket holds {symbol} yet.</p>
              <Link href={createHref}>Create one</Link>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
