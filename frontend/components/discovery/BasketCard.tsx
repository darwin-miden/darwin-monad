"use client";

import Link from "next/link";
import { memo, useMemo, type CSSProperties } from "react";
import { Change, Chart } from "@/components/chart/Chart";
import { CompositionTreemap } from "@/components/treemap/CompositionTreemap";
import { LogoStack } from "@/components/ui/StockLogo";
import { short, usd } from "@/lib/format";
import { useNavHistory } from "@/lib/navHistory";
import type { Basket } from "@/lib/data/types";
import styles from "./Discovery.module.css";

export const BasketCard = memo(function BasketCard({
  b,
  capacityMax,
  density = "browser",
}: {
  b: Basket;
  capacityMax: number;
  density?: "browser" | "compact";
}) {
  const compact = density === "compact";
  const history = useNavHistory(b.legs, "30D");
  const byWeight = useMemo(() => [...b.legs].sort((x, y) => y.weight - x.weight), [b.legs]);
  const tiles = useMemo(() => b.legs.map((l) => ({ id: l.address, symbol: l.symbol, weight: l.weight })), [b.legs]);
  const share = capacityMax > 0 ? Math.min(1, Math.max(0, b.capacityUsd / capacityMax)) : 0;
  const capacity = b.capacityUsd > 0 ? usd(b.capacityUsd) : "—";
  const style = useMemo(() => ({ "--capacity-share": `${100 * share}%` }) as CSSProperties, [share]);

  return (
    <Link
      href={`/basket/${b.address}`}
      className={`${styles.basketRow}${compact ? ` ${styles.compact}` : ""}`}
      style={style}
      aria-label={`Open ${b.name}, ${b.symbol}. NAV ${usd(b.navUsd)}. One percent capacity ${b.capacityUsd > 0 ? usd(b.capacityUsd) : "not available"}.`}
    >
      <div className={styles.basketIdentity}>
        <div className={styles.identityTop}>
          <LogoStack legs={byWeight} size={compact ? 27 : 31} />
          <div className={styles.basketName}>
            <strong>{b.name}</strong>
            <span>
              {b.symbol} · {b.quote}
            </span>
          </div>
        </div>
        <div className={styles.basketMeta}>by {short(b.owner)}</div>
        {b.paused && <div className={styles.paused}>Trading paused</div>}
      </div>
      <div className={styles.basketComposition}>
        <CompositionTreemap items={tiles} compact={compact} className={styles.rowTreemap} />
      </div>
      <div className={styles.basketTrend}>
        <div className={styles.trendChart}>
          <Chart history={history} height={compact ? 50 : 160} fill />
        </div>
        <div className={styles.trendMeta}>
          <span>30D</span>
          <Change value={history.change} />
        </div>
      </div>
      <div className={styles.basketValues}>
        <div className={styles.navValue}>{usd(b.navUsd)}</div>
        <div className={styles.metricLabel}>NAV / share</div>
        <div className={styles.capacity}>
          <div className={styles.capacityLine}>
            <span>1% capacity</span>
            <strong>{capacity}</strong>
          </div>
          <div className={styles.capacityTrack} aria-hidden="true">
            <span />
          </div>
          <div className={styles.backedLine}>
            <span>Backed</span>
            <strong>{usd(b.tvlUsd)}</strong>
          </div>
        </div>
      </div>
    </Link>
  );
});
