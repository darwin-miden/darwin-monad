"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { BasketCard } from "@/components/discovery/BasketCard";
import { SearchField } from "@/components/discovery/SearchField";
import { Dropdown } from "@/components/ui/Dropdown";
import { useBaskets } from "@/lib/data/store";
import type { Basket } from "@/lib/data/types";
import styles from "@/components/discovery/Discovery.module.css";

type Sort = "Capacity" | "NAV" | "Backed" | "Supply" | "Newest";

const SORT_OPTIONS = (["Capacity", "NAV", "Backed", "Supply", "Newest"] as const).map((v) => ({ value: v, label: v }));

const SORT_KEY: Record<Exclude<Sort, "Newest">, "capacityUsd" | "navUsd" | "tvlUsd" | "supplyFloat"> = {
  Capacity: "capacityUsd",
  NAV: "navUsd",
  Backed: "tvlUsd",
  Supply: "supplyFloat",
};

const ALL_TYPES = "All";
const ANY_QUOTE = "Any quote";

function assetType(b: Basket): string | null {
  const classes = new Set<string>(b.legs.map((l) => l.class));
  if (classes.size > 1) return "Mixed";
  return classes.has("stock") ? "Stocks" : null;
}

function BasketListSkeleton() {
  return (
    <div className={styles.basketList} aria-label="Loading baskets" aria-busy="true">
      {[0, 1, 2].map((i) => (
        <div key={i} className={styles.skeletonRow} aria-hidden="true">
          <div className={styles.skeletonIdentity}>
            <span className="sk" style={{ width: 78, height: 31, borderRadius: 18 }} />
            <span className={styles.skeletonLines}>
              <span className="sk" style={{ width: "82%", height: 15 }} />
              <span className="sk" style={{ width: "54%", height: 11 }} />
            </span>
          </div>
          <span className={`sk ${styles.skeletonBlock} ${styles.skeletonComposition}`} />
          <span className={`sk ${styles.skeletonBlock} ${styles.skeletonTrend}`} />
          <span className={styles.skeletonValues}>
            <span className="sk" style={{ width: "72%", height: 28 }} />
            <span className="sk" style={{ width: "100%", height: 4 }} />
            <span className="sk" style={{ width: "86%", height: 12 }} />
          </span>
        </div>
      ))}
    </div>
  );
}

export default function BasketsPage() {
  const { data: baskets, error } = useBaskets();
  const [query, setQuery] = useState("");
  const [quote, setQuote] = useState(ANY_QUOTE);
  const [type, setType] = useState(ALL_TYPES);
  const [sort, setSort] = useState<Sort>("Capacity");

  const typeOptions = useMemo(() => {
    const present = new Set((baskets ?? []).map(assetType));
    return [ALL_TYPES, ...["Stocks", "Mixed"].filter((t) => present.has(t))].map((v) => ({ value: v, label: v }));
  }, [baskets]);

  const quoteOptions = useMemo(() => {
    const present = new Set((baskets ?? []).map((b) => b.quote));
    return [ANY_QUOTE, ...(["USDC", "MON"] as const).filter((q) => present.has(q))].map((v) => ({ value: v, label: v }));
  }, [baskets]);

  const activeType = typeOptions.some((o) => o.value === type) ? type : ALL_TYPES;
  const activeQuote = quoteOptions.some((o) => o.value === quote) ? quote : ANY_QUOTE;
  const filtering = query !== "" || activeQuote !== ANY_QUOTE || activeType !== ALL_TYPES;

  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matches = (baskets ?? [])
      .map((b, order) => ({ b, order }))
      .filter(
        ({ b }) =>
          (!needle || [b.symbol, b.name, b.address, ...b.legs.map((l) => l.symbol)].some((s) => s.toLowerCase().includes(needle))) &&
          (activeQuote === ANY_QUOTE || b.quote === activeQuote) &&
          (activeType === ALL_TYPES || assetType(b) === activeType),
      );
    // Newest first: later entries in the list were created more recently.
    if (sort === "Newest") return matches.sort((x, y) => y.order - x.order).map(({ b }) => b);
    const key = SORT_KEY[sort];
    return matches.map(({ b }) => b).sort((x, y) => y[key] - x[key]);
  }, [activeQuote, activeType, baskets, query, sort]);

  const capacityMax = Math.max(0, ...results.map((b) => b.capacityUsd));

  return (
    <main className={`page ${styles.browserPage}`}>
      <div className="wrap">
        <header className={styles.browserHeader}>
          <h1 className="t-h1">Baskets</h1>
        </header>
        <section className={styles.browserSurface} aria-label="Browse baskets">
          <div className={styles.browserToolbar}>
            <SearchField value={query} onChange={setQuery} placeholder="Search baskets or assets" />
            <div className={styles.filterControl} role="group" aria-label="Asset type">
              <span>Asset type</span>
              <Dropdown options={typeOptions} value={type} onChange={setType} ariaLabel="Filter by asset type" />
            </div>
            <div className={styles.filterControl} role="group" aria-label="Quote asset">
              <span>Quote</span>
              <Dropdown options={quoteOptions} value={quote} onChange={setQuote} ariaLabel="Filter by quote asset" />
            </div>
            <div className={styles.filterControl} role="group" aria-label="Sort baskets">
              <span>Sort</span>
              <Dropdown options={SORT_OPTIONS} value={sort} onChange={(v) => setSort(v as Sort)} ariaLabel="Sort baskets" />
            </div>
          </div>
          {filtering && (
            <div className={styles.resultsLine}>
              <button
                className={styles.clearButton}
                onClick={() => {
                  setQuery("");
                  setQuote(ANY_QUOTE);
                  setType(ALL_TYPES);
                }}
              >
                Clear filters
              </button>
            </div>
          )}
          {error && <p className={styles.error}>{error}</p>}
          {!baskets && !error && <BasketListSkeleton />}
          {baskets && results.length === 0 && (
            <div className={styles.empty}>
              <h2>{baskets.length === 0 ? "No baskets yet." : "No matching baskets."}</h2>
              <p>{baskets.length === 0 ? "Create the first fixed-unit basket." : "Change or clear the filters."}</p>
              {baskets.length === 0 && (
                <Link href="/create" className="btn btn-ink">
                  Create basket
                </Link>
              )}
            </div>
          )}
          {results.length > 0 && (
            <div className={styles.basketList}>
              {results.map((b) => (
                <BasketCard key={b.address} b={b} capacityMax={capacityMax} />
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
