"use client";

import Link from "next/link";
import { useMemo } from "react";
// FeaturedBasket first: its portfolio.module.css must load before Discovery.module.css,
// whose featured* rules override the portfolio workspace padding.
import { FeaturedBasket, FeaturedBasketSkeleton } from "@/components/discovery/FeaturedBasket";
import { BasketCard } from "@/components/discovery/BasketCard";
import { HeroShader } from "@/components/discovery/HeroShader";
import { FEATURED_BASKET, useBaskets } from "@/lib/data/store";
import styles from "@/components/discovery/Discovery.module.css";

export default function Home() {
  const { data: baskets, error } = useBaskets();
  const byCapacity = useMemo(() => (baskets ? [...baskets].sort((a, b) => b.capacityUsd - a.capacityUsd) : null), [baskets]);
  const featured = baskets?.find((b) => b.address.toLowerCase() === FEATURED_BASKET) ?? byCapacity?.[0];
  const explore =
    (byCapacity && (byCapacity.length > 3 ? byCapacity.filter((b) => b.address !== featured?.address).slice(0, 3) : byCapacity)) ?? [];
  const capacityMax = Math.max(0, ...explore.map((b) => b.capacityUsd));

  return (
    <main className={`page ${styles.home}`}>
      <div className="wrap">
        <section className={styles.homeHero}>
          <HeroShader className={styles.heroShader} />
          <div className={styles.heroCopy}>
            <h1 className="t-hero">Trade a portfolio as one share.</h1>
            <p className="t-lead">Own fixed units of several assets in one basket. No rebalancing.</p>
            <div className={styles.heroActions}>
              <Link href="/baskets" className="btn btn-lg btn-ink">
                Browse baskets
              </Link>
              <Link href="/create" className={`btn btn-lg ${styles.heroSecondary}`}>
                Create basket
              </Link>
            </div>
          </div>
          {!baskets && !error && <FeaturedBasketSkeleton />}
          {featured && <FeaturedBasket basket={featured} />}
          {baskets?.length === 0 && (
            <div className={styles.flowEmpty}>
              <div>
                <strong>No baskets yet.</strong>
                <p>Create the first fixed-unit basket.</p>
              </div>
            </div>
          )}
          {error && <div className={styles.flowEmpty}>{error}</div>}
        </section>
        {!!byCapacity?.length && (
          <section className={styles.discoverySection} aria-labelledby="explore-baskets">
            <div className={styles.sectionHeader}>
              <h2 className="t-h2" id="explore-baskets">
                Explore baskets
              </h2>
              <Link href="/baskets" className={styles.sectionLink}>
                View all <span aria-hidden="true">→</span>
              </Link>
            </div>
            {explore.length > 0 ? (
              <div className={styles.compactList}>
                {explore.map((b) => (
                  <BasketCard key={b.address} b={b} capacityMax={capacityMax} density="compact" />
                ))}
              </div>
            ) : (
              <div className={styles.empty}>
                <p>Create another basket to compare.</p>
                <Link href="/create" className="btn btn-line">
                  Create basket
                </Link>
              </div>
            )}
          </section>
        )}
      </div>
    </main>
  );
}
