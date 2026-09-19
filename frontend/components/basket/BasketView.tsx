"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Change, Chart } from "@/components/chart/Chart";
import { CompositionTreemap } from "@/components/treemap/CompositionTreemap";
import { Segmented } from "@/components/ui/Segmented";
import { LogoStack, StockLogo } from "@/components/ui/StockLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { VisualToggle, type VisualMode } from "@/components/ui/VisualToggle";
import { ASSETS, useBasket } from "@/lib/data/store";
import type { Range } from "@/lib/data/types";
import { pct, qty, short, usd } from "@/lib/format";
import { RANGES, useNavHistory } from "@/lib/navHistory";
import { chain } from "@/lib/wallet";
import { TRADE_MODES, TradePanel, type TradeMode } from "./TradePanel";
import styles from "./basket.module.css";

/** Routes shallower than this (USD at 1% impact) are flagged as limited. */
const ADMISSIBLE_DEPTH_USD = 1000;

const addressUrl = (address: string) => `${chain.blockExplorers.default.url}/address/${address}`;

const assetName = (address: string, fallback: string) =>
  ASSETS.find((a) => a.address.toLowerCase() === address.toLowerCase())?.name || fallback;

function Page({ children }: { children: ReactNode }) {
  return (
    <main className="page">
      <div className="wrap">{children}</div>
    </main>
  );
}

function LoadingBasket() {
  return (
    <div aria-label="Loading basket" aria-busy="true">
      <span className={`sk ${styles.loadingCrumb}`} aria-hidden />
      <section className={`card card-lg ${styles.identity}`} aria-hidden>
        <div className={styles.identityMain}>
          <span className={`sk ${styles.loadingLogos}`} />
          <span className={styles.loadingLines}>
            <span className="sk" />
            <span className="sk" />
          </span>
        </div>
        <span className={styles.loadingNav}>
          <span className="sk" />
          <span className="sk" />
          <span className="sk" />
        </span>
      </section>
      <section className={`card ${styles.canvas}`} aria-hidden>
        <div className={styles.region}>
          <div className={styles.regionHead}>
            <span className={`sk ${styles.loadingVisualSwitch}`} />
            <span className={`sk ${styles.loadingVisualControl}`} />
          </div>
          <div className={styles.visualBody}>
            <span className={`sk ${styles.loadingPlot}`} />
          </div>
          <div className={styles.visualFoot}>
            <span className={`sk ${styles.loadingEndpoint}`} />
            <span className={`sk ${styles.loadingEndpoint}`} />
          </div>
        </div>
        <div className={`${styles.region} ${styles.loadingTrade}`}>
          <span className="sk" />
          <span className="sk" />
          <span className="sk" />
          <span className="sk" />
          <span className="sk" />
        </div>
      </section>
      <div className={`card ${styles.loadingDetails}`} aria-hidden>
        <span className="sk" />
      </div>
    </div>
  );
}

export function BasketView({ address, mode }: { address: string; mode?: string }) {
  const initialMode = TRADE_MODES.find((m) => m.toLowerCase() === mode?.toLowerCase()) as TradeMode | undefined;
  const { data: basket } = useBasket(address);
  const [range, setRange] = useState<Range>("30D");
  const [visual, setVisual] = useState<VisualMode>("Chart");
  const history = useNavHistory(basket?.legs, range);
  const byWeight = useMemo(() => [...(basket?.legs ?? [])].sort((a, b) => b.weight - a.weight), [basket?.legs]);
  const tiles = useMemo(
    () => (basket?.legs ?? []).map((l) => ({ id: l.address, symbol: l.symbol, weight: l.weight })),
    [basket?.legs],
  );

  // Baskets created in this browser load from storage after mount; don't call them missing before that.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot mount flag
    setMounted(true);
  }, []);

  if (!basket) {
    return (
      <Page>{mounted ? <p className="t-body c-negative">No basket found at {short(address)}.</p> : <LoadingBasket />}</Page>
    );
  }

  const start = history.points[0]?.[1];
  const end = history.points.at(-1)?.[1];
  const thin = basket.legs.filter((l) => l.depthUsd > 0 && l.depthUsd < ADMISSIBLE_DEPTH_USD);
  const alerts = [
    ...(basket.paused ? ["Issuance is paused. Redemption remains open."] : []),
    ...(thin.length > 0 ? [`Limited route depth: ${thin.map((l) => l.symbol).join(", ")}.`] : []),
  ];
  const facts: [string, string][] = [
    ["Backed", usd(basket.tvlUsd)],
    ["Supply", qty(basket.supplyFloat)],
    [
      "Mint / redeem fee",
      `${basket.mintFeeBps + basket.protocolMintFeeBps} / ${basket.redeemFeeBps + basket.protocolRedeemFeeBps} bps`,
    ],
    ["Quote", basket.quote],
    ["Owner", short(basket.owner)],
  ];

  return (
    <Page>
      <div className={styles.breadcrumb}>
        <Link href="/baskets">Baskets</Link>
        <span>/</span>
        <span>{basket.symbol}</span>
      </div>
      <section className={`card card-lg ${styles.identity}`}>
        <div className={styles.identityMain}>
          <LogoStack legs={byWeight} size={44} />
          <div className={styles.identityCopy}>
            <div className={styles.titleLine}>
              <h1>{basket.name}</h1>
              <span className={styles.symbol}>/ {basket.symbol}</span>
            </div>
            <div className={styles.identityMeta}>
              <span>by {short(basket.owner)}</span>
              <span>·</span>
              <a href={addressUrl(basket.address)} target="_blank" rel="noreferrer">
                {short(basket.address)}
              </a>
            </div>
          </div>
        </div>
        <div className={styles.navValue}>
          <div className={`${styles.navLabel} label-row`}>
            NAV per share
            <Tooltip term="navPerShare" align="right" />
          </div>
          <div className={`${styles.navNumber} num`}>{usd(basket.navUsd)}</div>
          <div className={styles.navChange}>
            <Change value={history.change} suffix={range} />
          </div>
        </div>
      </section>
      {alerts.length > 0 && (
        <div className={styles.alerts}>
          {alerts.map((alert) => (
            <div key={alert} className="notice" data-kind="warn">
              {alert}
            </div>
          ))}
        </div>
      )}
      <section className={`card ${styles.canvas}`}>
        <div className={styles.region}>
          <div className={styles.regionHead}>
            <VisualToggle value={visual} onChange={setVisual} label="Basket visualization" />
            <div className={styles.visualControl}>
              {visual === "Chart" ? (
                <Segmented options={RANGES} value={range} onChange={setRange} label="Chart range" bare />
              ) : (
                <span className={`${styles.visualMeta} label-row`}>
                  Composition
                  <Tooltip term="basketComposition" align="right" side="bottom" />
                </span>
              )}
            </div>
          </div>
          <div className={styles.visualBody}>
            <div className={styles.visualLayer} data-active={visual === "Chart" || undefined} aria-hidden={visual !== "Chart"}>
              <Chart history={history} height={360} weight={1.75} grid fill />
            </div>
            <div className={styles.visualLayer} data-active={visual === "Grid" || undefined} aria-hidden={visual !== "Grid"}>
              <CompositionTreemap items={tiles} className={styles.treemap} />
            </div>
          </div>
          <div className={styles.visualFoot} aria-hidden>
            {visual === "Chart" ? (
              <>
                <span>
                  Start
                  <b className="num">{start === undefined ? "—" : usd(start)}</b>
                </span>
                <span className={styles.right}>
                  Now
                  <b className="num">{end === undefined ? "—" : usd(end)}</b>
                </span>
              </>
            ) : null}
          </div>
        </div>
        <div className={styles.region}>
          <TradePanel key={`${basket.address}-${initialMode ?? "default"}`} b={basket} compact embedded initialMode={initialMode} />
        </div>
      </section>
      <details className={`card ${styles.details}`}>
        <summary>Composition and protocol details</summary>
        <div className={styles.detailsBody}>
          <div className={styles.facts}>
            {facts.map(([label, value]) => (
              <div key={label} className={styles.fact}>
                <span>{label}</span>
                <b className="num">{value}</b>
              </div>
            ))}
          </div>
          <div className={styles.table}>
            <div className={styles.tableInner}>
              <div className={styles.tableHead}>
                <span>Asset</span>
                <span className={styles.right}>NAV share</span>
                <span className={styles.right}>Units / share</span>
                <span className={styles.right}>Value</span>
                <span className={styles.right}>1% depth</span>
              </div>
              {basket.legs.map((leg) => (
                <div key={leg.address} className={styles.tableRow}>
                  <span className={styles.asset}>
                    <StockLogo sym={leg.symbol} size={26} />
                    <span>
                      <b>{assetName(leg.address, leg.symbol)}</b>
                      <small>{leg.symbol}</small>
                    </span>
                  </span>
                  <span className={`${styles.right} num`}>{pct(leg.weight)}</span>
                  <span className={`${styles.right} num`}>{qty(leg.perShare)}</span>
                  <span className={`${styles.right} num`}>{usd(leg.valueUsd)}</span>
                  <span className={`${styles.right} num`}>{usd(leg.depthUsd)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </details>
    </Page>
  );
}
