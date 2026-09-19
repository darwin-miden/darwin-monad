"use client";

import Link from "next/link";
import { memo, useMemo } from "react";
import { Change, Chart } from "@/components/chart/Chart";
import { LogoStack, StockLogo } from "@/components/ui/StockLogo";
import { usd } from "@/lib/format";
import { useNavHistory } from "@/lib/navHistory";
import type { Basket } from "@/lib/data/types";
import portfolio from "@/components/portfolio/portfolio.module.css";
import styles from "./Discovery.module.css";

export const FeaturedBasket = memo(function FeaturedBasket({ basket }: { basket: Basket }) {
  const history = useNavHistory(basket.legs, "30D");
  const legs = useMemo(() => [...basket.legs].sort((a, b) => b.weight - a.weight), [basket.legs]);
  const total = legs.reduce((sum, l) => sum + l.weight, 0);
  const start = history.points[0]?.[1];
  const now = history.points.at(-1)?.[1];

  return (
    <Link
      href={`/basket/${basket.address}`}
      className={`${portfolio.workspace} card ${styles.featuredPortfolioCard}`}
      aria-label={`Open ${basket.name}, ${basket.symbol}. NAV ${usd(basket.navUsd)}.`}
    >
      <header className={`${portfolio.workspaceHeader} ${styles.featuredPortfolioHeader}`}>
        <div className={styles.featuredIdentity}>
          <LogoStack legs={legs} size={32} />
          <span>
            <strong>{basket.name}</strong>
            <small>
              {basket.symbol} · {basket.quote}
            </small>
          </span>
        </div>
        <div className={styles.featuredValue}>
          <span>NAV / share</span>
          <div>
            <strong className="num">{usd(basket.navUsd)}</strong>
            <Change value={history.change} suffix="30d" />
          </div>
        </div>
      </header>
      <div className={`${portfolio.workspaceBody} ${styles.featuredPortfolioBody}`}>
        <section className={`${portfolio.visualRegion} ${styles.featuredVisualRegion}`}>
          <div className={portfolio.regionHeading}>
            <h3>Performance</h3>
            <span>30D</span>
          </div>
          <div className={portfolio.visualViewport}>
            <div className={styles.featuredChart}>
              <Chart history={history} height={150} weight={1.75} grid fill />
            </div>
          </div>
          <div className={`${portfolio.visualFooter} ${styles.featuredChartFooter}`}>
            <span>
              Start<b className="num">{start === undefined ? "—" : usd(start)}</b>
            </span>
            <span className={portfolio.right}>
              Now<b className="num">{now === undefined ? "—" : usd(now)}</b>
            </span>
          </div>
        </section>
        <section className={`${portfolio.holdingsRegion} ${styles.featuredHoldingsRegion}`}>
          <div className={`${portfolio.holdingsHeader} ${styles.featuredHoldingsHeader}`}>
            <h2>Underlying assets</h2>
          </div>
          <div className={styles.featuredAssetList} role="list" aria-label={`${basket.name} underlying assets`}>
            {legs.map((leg) => {
              const share = total > 0 ? leg.weight / total : 0;
              return (
                <div key={leg.address} className={styles.featuredAssetRow} role="listitem">
                  <div className={styles.featuredAssetIdentity}>
                    <StockLogo sym={leg.symbol} size={24} />
                    <strong>{leg.symbol}</strong>
                  </div>
                  <span className={styles.featuredAssetTrack} aria-hidden="true">
                    <span style={{ width: `${100 * share}%` }} />
                  </span>
                  <span className="num">{Math.round(100 * share)}%</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </Link>
  );
});

export function FeaturedBasketSkeleton() {
  return (
    <div
      className={`${portfolio.workspace} card ${styles.featuredPortfolioCard} ${styles.featuredPortfolioSkeleton}`}
      aria-label="Loading featured portfolio"
      aria-busy="true"
    >
      <header className={`${portfolio.workspaceHeader} ${styles.featuredPortfolioHeader}`} aria-hidden="true">
        <span className={`sk ${styles.featuredSkeletonIdentity}`} />
        <span className={`sk ${styles.featuredSkeletonValue}`} />
      </header>
      <div className={`${portfolio.workspaceBody} ${styles.featuredPortfolioBody}`} aria-hidden="true">
        <section className={`${portfolio.visualRegion} ${styles.featuredVisualRegion}`}>
          <span className={`sk ${styles.featuredSkeletonLabel}`} />
          <span className={`sk ${styles.featuredSkeletonChart}`} />
          <span className={`sk ${styles.featuredSkeletonFooter}`} />
        </section>
        <section className={`${portfolio.holdingsRegion} ${styles.featuredHoldingsRegion}`}>
          <div className={`${portfolio.holdingsHeader} ${styles.featuredHoldingsHeader}`}>
            <span className={`sk ${styles.featuredSkeletonLabel}`} />
          </div>
          <div className={styles.featuredAssetList}>
            {[0, 1, 2, 3].map((i) => (
              <span key={i} className={`sk ${styles.featuredSkeletonAsset}`} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
