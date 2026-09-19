"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { LogoStack } from "@/components/ui/StockLogo";
import { useBaskets } from "@/lib/data/store";
import type { Basket } from "@/lib/data/types";
import { LOCALE, short, usd } from "@/lib/format";
import { useWallet } from "@/lib/wallet";
import styles from "./leaderboard.module.css";

const METRICS = ["Backed", "Baskets", "Capacity"] as const;
type Metric = (typeof METRICS)[number];

type Creator = {
  creator: string;
  tvlUsd: number;
  baskets: number;
  symbols: string[];
  capacity: number;
  ownedBaskets: Basket[];
};

const metricValue = (c: Creator, metric: Metric) =>
  metric === "Backed" ? c.tvlUsd : metric === "Capacity" ? c.capacity : c.baskets;

const metricLabel = (c: Creator, metric: Metric) =>
  metric === "Backed" ? usd(c.tvlUsd) : metric === "Capacity" ? usd(c.capacity) : c.baskets.toLocaleString(LOCALE);

function CreatorBaskets({ creator }: { creator: Creator }) {
  if (creator.ownedBaskets.length === 0) {
    return (
      <div className={styles.symbolFallback} aria-label="Basket symbols">
        {creator.symbols.slice(0, 3).join(" · ")}
        {creator.symbols.length > 3 && ` +${creator.symbols.length - 3}`}
      </div>
    );
  }
  return (
    <div className={styles.basketIdentities} aria-label="Leading baskets by backed value">
      {creator.ownedBaskets.slice(0, 3).map((basket) => (
        <Link key={basket.address} className={styles.basketIdentity} href={`/basket/${basket.address}`}>
          <LogoStack legs={basket.legs.slice().sort((a, b) => b.valueUsd - a.valueUsd)} size={25} />
          <span>{basket.symbol}</span>
        </Link>
      ))}
      {creator.ownedBaskets.length > 3 && <span className={styles.more}>+{creator.ownedBaskets.length - 3}</span>}
    </div>
  );
}

function SecondaryMetrics({ creator, selected }: { creator: Creator; selected: Metric }) {
  return (
    <dl className={styles.secondary}>
      {METRICS.filter((m) => m !== selected).map((metric) => (
        <div key={metric}>
          <dt>{metric}</dt>
          <dd className="num">{metricLabel(creator, metric)}</dd>
        </div>
      ))}
    </dl>
  );
}

function LoadingRanking() {
  return (
    <div className={`${styles.ranking} card`} aria-label="Loading leaderboard" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.rankRow} aria-hidden>
          <span className={`${styles.rankPlaceholder} sk`} />
          <div className={styles.creatorPlaceholder}>
            <span className="sk" />
            <span className="sk" />
            <span className="sk" />
          </div>
          <div className={styles.measurePlaceholder}>
            <span className="sk" />
            <span className="sk" />
            <span className="sk" />
          </div>
        </div>
      ))}
    </div>
  );
}

export default function LeaderboardPage() {
  const { data, error } = useBaskets();
  const { address } = useWallet();
  const [metric, setMetric] = useState<Metric>("Backed");

  const creators = useMemo(() => {
    if (!data) return [];
    const byOwner = new Map<string, Creator>();
    for (const basket of data) {
      const key = basket.owner.toLowerCase();
      const entry = byOwner.get(key) ?? { creator: basket.owner, tvlUsd: 0, baskets: 0, symbols: [], capacity: 0, ownedBaskets: [] };
      entry.tvlUsd += basket.tvlUsd;
      entry.baskets += 1;
      entry.symbols.push(basket.symbol);
      entry.capacity += basket.capacityUsd;
      entry.ownedBaskets.push(basket);
      byOwner.set(key, entry);
    }
    return [...byOwner.values()]
      .map((c) => ({
        ...c,
        ownedBaskets: c.ownedBaskets.slice().sort((a, b) => b.tvlUsd - a.tvlUsd || a.symbol.localeCompare(b.symbol)),
      }))
      .sort((a, b) => metricValue(b, metric) - metricValue(a, metric) || a.creator.localeCompare(b.creator));
  }, [data, metric]);

  const leader = creators.reduce((max, c) => Math.max(max, metricValue(c, metric)), 0);
  const loading = !data;

  return (
    <main className={`page ${styles.leaderboardPage}`}>
      <div className={`wrap ${styles.leaderboardWrap}`}>
        <section className={styles.pageHeading}>
          <h1 className="t-h1">Leaderboard</h1>
          <Segmented options={METRICS} value={metric} onChange={setMetric} label="Rank creators by" />
        </section>
        {error && <p className={`${styles.error} c-negative`}>{error}</p>}
        {loading && !error && <LoadingRanking />}
        {!loading && creators.length === 0 && !error && (
          <section className={`${styles.empty} card`}>
            <h2>No creators ranked yet.</h2>
            <Link href="/create" className="btn btn-ink">
              Create a basket
            </Link>
          </section>
        )}
        {creators.length > 0 && (
          <ol className={`${styles.ranking} card`} aria-label={`Creators ranked by ${metric.toLowerCase()}`}>
            {creators.map((creator, index) => {
              const value = metricValue(creator, metric);
              const share = leader > 0 ? value / leader : 0;
              const isYou = !!address && creator.creator.toLowerCase() === address.toLowerCase();
              return (
                <li key={creator.creator} className={styles.rankRow}>
                  <span className={`${styles.rank} num`} aria-label={`Rank ${index + 1}`}>
                    {index + 1}
                  </span>
                  <div className={styles.creator}>
                    <div className={styles.creatorLine}>
                      <strong className="mono" title={creator.creator}>
                        {short(creator.creator)}
                      </strong>
                      {isYou && <span>You</span>}
                    </div>
                    <CreatorBaskets creator={creator} />
                  </div>
                  <div className={styles.measure}>
                    <div className={styles.measureLabel}>
                      <span>{metric}</span>
                      <strong className="num">{metricLabel(creator, metric)}</strong>
                    </div>
                    <div
                      className={styles.track}
                      role="img"
                      aria-label={`${metricLabel(creator, metric)}, ${(100 * share).toFixed(1)}% of the leading value`}
                    >
                      <span style={{ width: `${100 * share}%` }} />
                    </div>
                    <SecondaryMetrics creator={creator} selected={metric} />
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </main>
  );
}
