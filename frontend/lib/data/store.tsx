"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useConnection } from "wagmi";
import snapshot from "./snapshot.json";
import type { Asset, Basket, Leg, Position, Quote } from "./types";

const STORAGE_KEY = "darwin-demo-v1";

export const FEATURED_BASKET = snapshot.featured.toLowerCase();
export const MON_USD = snapshot.monUsd;
export const ASSETS = snapshot.assets as Asset[];
const SEED_BASKETS = snapshot.baskets as Basket[];

/** Liquidity-limited trade size at a given price impact (default 1%). */
export function capacityUsd(legs: Pick<Leg, "weight" | "depthUsd">[], impact = 0.01) {
  const cost = legs.reduce((sum, l) => (l.depthUsd > 0 ? sum + (l.weight * l.weight) / (200 * l.depthUsd) : Infinity), 0);
  return cost > 0 && Number.isFinite(cost) ? impact / cost : 0;
}

export type NewBasket = {
  name: string;
  symbol: string;
  quote: Quote;
  navUsd: number;
  owner: string;
  /** Starting share of NAV per asset, summing to 1. */
  allocations: { symbol: string; weight: number }[];
};

type Persisted = {
  created: Basket[];
  /** wallet (lowercase) -> basket (lowercase) -> shares */
  balances: Record<string, Record<string, number>>;
};

type Store = {
  baskets: Basket[];
  assets: Asset[];
  balanceOf: (wallet: string | undefined, basket: string) => number;
  positionsOf: (wallet: string | undefined) => Position[];
  /** Mint (positive) or burn (negative) shares for a wallet. */
  transact: (wallet: string, basket: string, sharesDelta: number) => void;
  createBasket: (input: NewBasket) => Basket;
};

const DarwinContext = createContext<Store | null>(null);

const randomAddress = () =>
  `0x${Array.from(crypto.getRandomValues(new Uint8Array(20)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

function buildBasket(input: NewBasket): Basket {
  const legs: Leg[] = input.allocations.map((a) => {
    const asset = ASSETS.find((x) => x.symbol === a.symbol);
    if (!asset) throw new Error(`Unknown asset ${a.symbol}`);
    const valueUsd = input.navUsd * a.weight;
    return {
      address: asset.address,
      symbol: asset.symbol,
      decimals: asset.decimals,
      class: asset.class,
      perShare: valueUsd / asset.priceUsd,
      priceUsd: asset.priceUsd,
      valueUsd,
      weight: a.weight,
      depthUsd: asset.depthUsd,
    };
  });
  return {
    address: randomAddress(),
    symbol: input.symbol,
    name: input.name,
    owner: input.owner,
    supplyFloat: 0,
    paused: false,
    mintFeeBps: 0,
    redeemFeeBps: 0,
    protocolMintFeeBps: 10,
    protocolRedeemFeeBps: 10,
    navUsd: input.navUsd,
    tvlUsd: 0,
    capacityUsd: capacityUsd(legs),
    costPerShareUsd: input.navUsd * 1.004,
    quote: input.quote,
    issuanceAvailable: 1e12,
    redemptionAvailable: 1e12,
    legs,
  };
}

export function DarwinProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Persisted>({ created: [], balances: {} });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate from storage after mount
      if (raw) setState(JSON.parse(raw) as Persisted);
    } catch {
      // Corrupt or unavailable storage: start fresh.
    }
  }, []);

  const persist = useCallback((update: (prev: Persisted) => Persisted) => {
    setState((prev) => {
      const next = update(prev);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage full or blocked: keep in memory only.
      }
      return next;
    });
  }, []);

  const baskets = useMemo(() => {
    const supply = new Map<string, number>();
    for (const wallet of Object.values(state.balances)) {
      for (const [basket, shares] of Object.entries(wallet)) supply.set(basket, (supply.get(basket) ?? 0) + shares);
    }
    return [...SEED_BASKETS, ...state.created].map((b) => {
      const extra = supply.get(b.address.toLowerCase()) ?? 0;
      if (!extra) return b;
      const supplyFloat = b.supplyFloat + extra;
      return { ...b, supplyFloat, tvlUsd: supplyFloat * b.navUsd };
    });
  }, [state]);

  const balanceOf = useCallback(
    (wallet: string | undefined, basket: string) => (wallet ? (state.balances[wallet.toLowerCase()]?.[basket.toLowerCase()] ?? 0) : 0),
    [state.balances],
  );

  const positionsOf = useCallback(
    (wallet: string | undefined) => {
      if (!wallet) return [];
      const held = state.balances[wallet.toLowerCase()] ?? {};
      return baskets
        .filter((b) => (held[b.address.toLowerCase()] ?? 0) > 0)
        .map((b) => {
          const balanceFloat = held[b.address.toLowerCase()];
          return { ...b, balanceFloat, valueUsd: balanceFloat * b.navUsd };
        });
    },
    [baskets, state.balances],
  );

  const transact = useCallback(
    (wallet: string, basket: string, sharesDelta: number) =>
      persist((prev) => {
        const w = wallet.toLowerCase();
        const k = basket.toLowerCase();
        const current = prev.balances[w]?.[k] ?? 0;
        const nextBalance = Math.max(0, current + sharesDelta);
        return { ...prev, balances: { ...prev.balances, [w]: { ...prev.balances[w], [k]: nextBalance } } };
      }),
    [persist],
  );

  const createBasket = useCallback(
    (input: NewBasket) => {
      const basket = buildBasket(input);
      persist((prev) => ({ ...prev, created: [...prev.created, basket] }));
      return basket;
    },
    [persist],
  );

  const value = useMemo(
    () => ({ baskets, assets: ASSETS, balanceOf, positionsOf, transact, createBasket }),
    [baskets, balanceOf, positionsOf, transact, createBasket],
  );

  return <DarwinContext.Provider value={value}>{children}</DarwinContext.Provider>;
}

export function useDarwin() {
  const store = useContext(DarwinContext);
  if (!store) throw new Error("useDarwin must be used inside DarwinProvider");
  return store;
}

export function useBaskets() {
  const { baskets } = useDarwin();
  return { data: baskets, error: null as string | null };
}

export function useBasket(address: string | undefined) {
  const { baskets } = useDarwin();
  const data = useMemo(
    () => (address ? (baskets.find((b) => b.address.toLowerCase() === address.toLowerCase()) ?? null) : null),
    [address, baskets],
  );
  return { data, error: null as string | null };
}

export function useAssets() {
  return { data: { assets: ASSETS, monUsd: MON_USD }, error: null as string | null };
}

export function useHoldings(wallet: string | undefined) {
  const { positionsOf } = useDarwin();
  const data = useMemo(() => positionsOf(wallet), [positionsOf, wallet]);
  return { data, error: null as string | null };
}

/** Connected wallet's positions. */
export function useMyHoldings() {
  const { address } = useConnection();
  return useHoldings(address);
}
