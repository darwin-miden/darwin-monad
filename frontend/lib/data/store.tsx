"use client";

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useConnection, usePublicClient } from "wagmi";
import type { Address, ContractFunctionReturnType } from "viem";
import {
  DEPLOYMENT,
  PROTOCOL_MINT_FEE_BPS,
  PROTOCOL_REDEEM_FEE_BPS,
  WAD,
  erc20Abi,
  fromUsdc,
  fromWad,
  lensAbi,
  routerAbi,
} from "@/lib/contracts";
import type { Asset, Basket, Leg, Position } from "./types";

type BasketView = ContractFunctionReturnType<typeof lensAbi, "view", "getBasket">;

export const FEATURED_BASKET = DEPLOYMENT.featured.toLowerCase();
/** No MON-quoted baskets on this deployment: every basket trades against USDC. */
export const MON_USD = 0;

/** Listed stocks with their display names. Live prices come from `useAssets`. */
export const ASSETS: Asset[] = DEPLOYMENT.stocks.map((s) => ({
  symbol: s.symbol,
  name: s.name,
  address: s.address,
  decimals: 18,
  class: "stock",
  priceUsd: 0,
  depthUsd: 0,
}));

const REFRESH_MS = 10_000;
const MAX_BASKETS = 500n;

/** Liquidity-limited trade size at a given price impact (default 1%). */
export function capacityUsd(legs: Pick<Leg, "weight" | "depthUsd">[], impact = 0.01) {
  const cost = legs.reduce((sum, l) => (l.depthUsd > 0 ? sum + (l.weight * l.weight) / (200 * l.depthUsd) : Infinity), 0);
  return cost > 0 && Number.isFinite(cost) ? impact / cost : 0;
}

/**
 * Routed trades clear against the StockMarket at the oracle price (fixed spread, no size impact),
 * so the binding limit on any basket trade is the market's USDC reserve.
 */
function toBasket(v: BasketView, costPerShare: bigint | undefined, reserveUsd: number): Basket {
  const legs: Leg[] = v.legs.map((l) => ({
    address: l.token,
    symbol: l.symbol,
    decimals: 18,
    class: "stock",
    perShare: fromWad(l.units),
    priceUsd: fromWad(l.price),
    valueUsd: fromWad(l.value),
    weight: Number(l.weightBps) / 1e4,
    depthUsd: reserveUsd,
  }));
  return {
    address: v.vault,
    symbol: v.symbol,
    name: v.name,
    description: v.description,
    owner: v.owner,
    createdAt: Number(v.createdAt),
    supplyFloat: fromWad(v.totalSupply),
    paused: false,
    mintFeeBps: v.mintFeeBps,
    redeemFeeBps: v.redeemFeeBps,
    protocolMintFeeBps: PROTOCOL_MINT_FEE_BPS,
    protocolRedeemFeeBps: PROTOCOL_REDEEM_FEE_BPS,
    navUsd: fromWad(v.nav),
    tvlUsd: fromWad(v.tvl),
    capacityUsd: reserveUsd,
    costPerShareUsd: fromUsdc(costPerShare),
    quote: "USDC",
    legs,
  };
}

function useMarketReserve() {
  const client = usePublicClient();
  return useQuery({
    queryKey: ["darwin", "reserve"],
    enabled: !!client,
    refetchInterval: REFRESH_MS,
    queryFn: async () =>
      fromUsdc(
        await client!.readContract({ address: DEPLOYMENT.usd, abi: erc20Abi, functionName: "balanceOf", args: [DEPLOYMENT.market] }),
      ),
  });
}

function useBasketsQuery() {
  const client = usePublicClient();
  const { data: reserve } = useMarketReserve();
  return useQuery({
    queryKey: ["darwin", "baskets", reserve],
    enabled: !!client && reserve !== undefined,
    refetchInterval: REFRESH_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const views = await client!.readContract({
        address: DEPLOYMENT.lens,
        abi: lensAbi,
        functionName: "getBaskets",
        args: [0n, MAX_BASKETS],
      });
      const costs = await client!.multicall({
        allowFailure: true,
        contracts: views.map((v) => ({
          address: DEPLOYMENT.router,
          abi: routerAbi,
          functionName: "quoteBuyExact" as const,
          args: [v.vault, WAD] as const,
        })),
      });
      return views.map((v, i) => toBasket(v, costs[i].status === "success" ? (costs[i].result as bigint) : undefined, reserve!));
    },
  });
}

type Store = {
  /** Refetches every on-chain read after a transaction. */
  refresh: () => Promise<void>;
};

const DarwinContext = createContext<Store | null>(null);

export function DarwinProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const refresh = useCallback(() => queryClient.invalidateQueries(), [queryClient]);
  const value = useMemo(() => ({ refresh }), [refresh]);
  return <DarwinContext.Provider value={value}>{children}</DarwinContext.Provider>;
}

export function useDarwin() {
  const store = useContext(DarwinContext);
  if (!store) throw new Error("useDarwin must be used inside DarwinProvider");
  return store;
}

const LOAD_ERROR = "Couldn't reach Monad Testnet. Retrying…";

export function useBaskets() {
  const { data, error } = useBasketsQuery();
  return { data, error: error && !data ? LOAD_ERROR : null };
}

export function useBasket(address: string | undefined) {
  const { data: baskets, error } = useBaskets();
  const data = useMemo(
    () => (address && baskets ? (baskets.find((b) => b.address.toLowerCase() === address.toLowerCase()) ?? null) : undefined),
    [address, baskets],
  );
  return { data, error };
}

export function useAssets() {
  const client = usePublicClient();
  const { data: reserve } = useMarketReserve();
  const { data, error } = useQuery({
    queryKey: ["darwin", "assets", reserve],
    enabled: !!client && reserve !== undefined,
    refetchInterval: REFRESH_MS,
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const assets = await client!.readContract({ address: DEPLOYMENT.lens, abi: lensAbi, functionName: "getAssets" });
      return assets.map(
        (a): Asset => ({
          symbol: a.symbol,
          name: ASSETS.find((s) => s.address.toLowerCase() === a.token.toLowerCase())?.name ?? a.name,
          address: a.token,
          decimals: a.decimals,
          class: "stock",
          priceUsd: fromWad(a.price),
          depthUsd: reserve!,
          updatedAt: Number(a.updatedAt),
        }),
      );
    },
  });
  return { data: data ? { assets: data, monUsd: MON_USD } : undefined, error: error && !data ? LOAD_ERROR : null };
}

export function useHoldings(wallet: string | undefined) {
  const client = usePublicClient();
  const { data: baskets } = useBaskets();
  const { data: holdings, error } = useQuery({
    queryKey: ["darwin", "holdings", wallet?.toLowerCase()],
    enabled: !!client && !!wallet,
    refetchInterval: REFRESH_MS,
    queryFn: () =>
      client!.readContract({ address: DEPLOYMENT.lens, abi: lensAbi, functionName: "getHoldings", args: [wallet as Address] }),
  });
  const data = useMemo(() => {
    if (!wallet) return [];
    if (!holdings || !baskets) return undefined;
    return holdings.flatMap((h): Position[] => {
      const basket = baskets.find((b) => b.address.toLowerCase() === h.vault.toLowerCase());
      if (!basket) return [];
      const balanceFloat = fromWad(h.balance);
      return [{ ...basket, balanceFloat, valueUsd: balanceFloat * basket.navUsd }];
    });
  }, [wallet, holdings, baskets]);
  return { data, error: error && !data ? LOAD_ERROR : null };
}

/** Connected wallet's positions. */
export function useMyHoldings() {
  const { address } = useConnection();
  return useHoldings(address);
}
