"use client";

import Link from "next/link";
import { memo, useCallback, useMemo, useState, type ReactNode } from "react";
import { Change, Chart } from "@/components/chart/Chart";
import { CompositionTreemap } from "@/components/treemap/CompositionTreemap";
import { Segmented } from "@/components/ui/Segmented";
import { LogoStack, StockLogo } from "@/components/ui/StockLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { VisualToggle, type VisualMode } from "@/components/ui/VisualToggle";
import { useHoldings } from "@/lib/data/store";
import type { Leg, Position, Range } from "@/lib/data/types";
import { portfolioUsd } from "@/lib/format";
import { RANGES, useNavHistory } from "@/lib/navHistory";
import { useWallet } from "@/lib/wallet";
import styles from "./portfolio.module.css";

type Exposure = { address: string; symbol: string; value: number; via: string[] };

function PageHeading({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <section className={styles.pageHeading}>
      <h1 className="t-h1">{title}</h1>
      {children}
    </section>
  );
}

/** Portfolio of the connected wallet, or of `addressOverride` when given. */
export function PortfolioView({
  addressOverride,
  heading = "Portfolio",
  headingAction,
}: {
  addressOverride?: string;
  heading?: string;
  headingAction?: ReactNode;
} = {}) {
  const wallet = useWallet();
  const visible = addressOverride !== undefined || wallet.isConnected;
  const { data, error } = useHoldings(addressOverride ?? wallet.address);
  const [range, setRange] = useState<Range>("30D");
  const [mode, setMode] = useState<VisualMode>("Chart");
  const [gridMounted, setGridMounted] = useState(false);
  const [selected, setSelected] = useState<string>();

  const onMode = useCallback((next: VisualMode) => {
    if (next === "Grid") setGridMounted(true);
    setMode(next);
  }, []);

  const book = useMemo(() => {
    const held = (data ?? []).filter((p) => p.balanceFloat > 0);
    const total = held.reduce((sum, p) => sum + p.valueUsd, 0);
    const byAsset = new Map<string, Exposure>();
    for (const position of held) {
      for (const leg of position.legs) {
        const key = leg.address.toLowerCase();
        const entry = byAsset.get(key) ?? { address: leg.address, symbol: leg.symbol, value: 0, via: [] };
        entry.value += leg.valueUsd * position.balanceFloat;
        if (!entry.via.includes(position.symbol)) entry.via.push(position.symbol);
        byAsset.set(key, entry);
      }
    }
    const exposures = [...byAsset.values()].filter((e) => e.value > 0).sort((a, b) => b.value - a.value);
    const exposureTotal = exposures.reduce((sum, e) => sum + e.value, 0);
    const exposureTiles = exposures.map((e) => ({
      id: e.address,
      symbol: e.symbol,
      weight: e.value,
      valueLabel: `${((e.value / exposureTotal) * 100).toFixed(1)}%`,
    }));
    // Every leg scaled by the shares held, so the NAV path reflects the whole book.
    const bookLegs: Leg[] = held.flatMap((p) => p.legs.map((leg) => ({ ...leg, perShare: leg.perShare * p.balanceFloat })));
    return { held, total, exposures, exposureTotal, exposureTiles, bookLegs };
  }, [data]);

  const history = useNavHistory(book.bookLegs.length ? book.bookLegs : undefined, range);
  const focus = book.exposures.find((e) => e.address === selected) ?? book.exposures[0];
  const start = history.points[0]?.[1];
  const now = history.points.at(-1)?.[1];

  if (!visible) {
    return (
      <main className={`page ${styles.portfolioPage}`}>
        <div className={`wrap ${styles.portfolioWrap}`}>
          <PageHeading title={heading}>{headingAction}</PageHeading>
          <div className={styles.portfolioContent}>
            <section className={`${styles.empty} card`}>
              <h2>Connect a wallet to view your portfolio.</h2>
              <button className="btn btn-ink" disabled={wallet.connecting} onClick={() => wallet.connect()}>
                Connect wallet
              </button>
            </section>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={`page ${styles.portfolioPage}`}>
      <div className={`wrap ${styles.portfolioWrap}`}>
        <PageHeading title={heading}>{headingAction}</PageHeading>
        <div className={styles.portfolioContent}>
          {error && <p className={`${styles.error} c-negative`}>{error}</p>}
          {!data && !error && <LoadingWorkspace />}
          {data && book.held.length === 0 && (
            <section className={`${styles.empty} card`}>
              <h2>No basket shares found.</h2>
              <Link href="/baskets" className="btn btn-ink">
                Browse baskets
              </Link>
            </section>
          )}
          {book.held.length > 0 && (
            <section className={`${styles.workspace} card`} aria-labelledby="portfolio-value">
              <header className={styles.workspaceHeader}>
                <div>
                  <p className={styles.eyebrow}>Portfolio value</p>
                  <div className={styles.valueLine}>
                    <h2 id="portfolio-value" className={`${styles.total} num`}>
                      {portfolioUsd(book.total)}
                    </h2>
                    <Change value={history.change} suffix={range.toLowerCase()} />
                  </div>
                </div>
                <div className={styles.workspaceControls}>
                  <VisualToggle value={mode} onChange={onMode} label="Portfolio visualization" gridLabel="Underlying exposure grid" />
                </div>
              </header>
              <div className={styles.workspaceBody}>
                <section className={styles.visualRegion} aria-labelledby="portfolio-visual-heading">
                  <div className={styles.regionHeading}>
                    <h3 id="portfolio-visual-heading" className="label-row">
                      {mode === "Chart" ? "Portfolio performance" : "Underlying exposure"}
                      <Tooltip term={mode === "Chart" ? "portfolioPerformance" : "underlyingExposure"} align="left" side="bottom" />
                    </h3>
                    {mode === "Chart" && <Segmented options={RANGES} value={range} onChange={setRange} label="Chart range" bare />}
                  </div>
                  <div className={styles.visualViewport}>
                    <div className={styles.visualLayer} data-active={mode === "Chart" || undefined} aria-hidden={mode !== "Chart"}>
                      <Chart history={history} height={360} weight={1.75} grid axis fill />
                    </div>
                    <div className={styles.visualLayer} data-active={mode === "Grid" || undefined} aria-hidden={mode !== "Grid"}>
                      {gridMounted &&
                        (book.exposureTiles.length > 0 ? (
                          <CompositionTreemap
                            items={book.exposureTiles}
                            className={styles.exposureMap}
                            label="Underlying portfolio exposure"
                            selectedId={focus?.address}
                            onSelect={setSelected}
                            selectLabel={(tile) => `View ${tile.symbol} exposure details`}
                          />
                        ) : (
                          <div className={styles.treemapEmpty}>No priced exposure</div>
                        ))}
                    </div>
                  </div>
                  <div className={styles.visualFooter}>
                    {mode === "Chart" ? (
                      <>
                        <span>
                          Start
                          <b className="num">{start === undefined ? "—" : portfolioUsd(start)}</b>
                        </span>
                        <span className={styles.right}>
                          Now
                          <b className="num">{now === undefined ? "—" : portfolioUsd(now)}</b>
                        </span>
                      </>
                    ) : focus ? (
                      <div className={styles.exposureDetail}>
                        <StockLogo sym={focus.symbol} size={28} />
                        <span>
                          <strong>{focus.symbol}</strong>
                          <small>via {focus.via.join(", ")}</small>
                        </span>
                        <span className={styles.exposureValue}>
                          <strong className="num">{portfolioUsd(focus.value)}</strong>
                          <small className="num">{((focus.value / book.exposureTotal) * 100).toFixed(1)}%</small>
                        </span>
                      </div>
                    ) : null}
                  </div>
                </section>
                <section className={styles.holdingsRegion} aria-labelledby="holdings-heading">
                  <div className={styles.holdingsHeader}>
                    <h2 id="holdings-heading" className="label-row">
                      Basket holdings
                      <Tooltip term="basketHoldings" align="left" />
                    </h2>
                  </div>
                  <HoldingRows positions={book.held} total={book.total} />
                </section>
              </div>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}

const HoldingRows = memo(function HoldingRows({ positions, total }: { positions: Position[]; total: number }) {
  return (
    <div className={styles.holdingScroller}>
      <div className={styles.holdingRows} role="list" aria-label="Basket holdings">
        {positions.map((position, index) => {
          const share = total > 0 ? position.valueUsd / total : 0;
          const legs = position.legs.slice().sort((a, b) => b.valueUsd - a.valueUsd);
          return (
            <article
              key={position.address}
              className={styles.holdingRow}
              role="listitem"
              aria-posinset={index + 1}
              aria-setsize={positions.length}
            >
              <div className={styles.holdingTop}>
                <Link
                  prefetch={false}
                  href={`/basket/${position.address}`}
                  className={styles.basketIdentity}
                  aria-label={`Open ${position.name} (${position.symbol})`}
                >
                  <LogoStack legs={legs} size={30} />
                  <span className={styles.basketName}>
                    <strong>{position.name}</strong>
                    <span>{position.symbol}</span>
                  </span>
                </Link>
                <strong className={`${styles.rowValue} num`}>{portfolioUsd(position.valueUsd)}</strong>
              </div>
              <div className={styles.holdingBottom}>
                <div className={styles.shareVisual} aria-label={`${(100 * share).toFixed(1)}% of portfolio`}>
                  <span className={styles.shareTrack} aria-hidden>
                    <span style={{ width: `${100 * share}%` }} />
                  </span>
                  <span className="num">{(100 * share).toFixed(1)}%</span>
                </div>
                <div className={styles.rowActions}>
                  <Link prefetch={false} href={`/basket/${position.address}`} className="btn btn-xs btn-line">
                    Open
                  </Link>
                  <Link prefetch={false} href={`/basket/${position.address}?mode=redeem`} className="btn btn-xs btn-ink">
                    Redeem
                  </Link>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
});

function LoadingWorkspace() {
  return (
    <section className={`${styles.workspace} card ${styles.loading}`} aria-label="Loading portfolio" aria-busy="true">
      <header className={`${styles.workspaceHeader} ${styles.loadingHeader}`} aria-hidden>
        <span className="sk" />
        <span className="sk" />
      </header>
      <div className={styles.workspaceBody} aria-hidden>
        <div className={styles.visualRegion}>
          <span className={`${styles.loadingVisual} sk`} />
        </div>
        <div className={styles.holdingsRegion}>
          <span className={`${styles.loadingTitle} sk`} />
          {[0, 1, 2].map((i) => (
            <span key={i} className={`${styles.loadingRow} sk`} />
          ))}
        </div>
      </div>
    </section>
  );
}
