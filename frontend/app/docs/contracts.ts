import { DEPLOYMENT } from "@/lib/contracts";
import basketFactory from "./abis/basket-factory.json";
import basketLens from "./abis/basket-lens.json";
import basketRouter from "./abis/basket-router.json";
import basketVault from "./abis/basket-vault.json";
import priceOracle from "./abis/price-oracle.json";
import stockMarket from "./abis/stock-market.json";
import stockToken from "./abis/stock-token.json";
import testUsd from "./abis/test-usd.json";

export const NETWORK = {
  name: "Monad Testnet",
  chainId: 10143,
  native: "MON",
  rpc: "https://testnet-rpc.monad.xyz",
  explorer: "https://testnet.monadexplorer.com",
  multicall3: "0xcA11bde05977b3631167028862bE2a173976CA11",
} as const;

/** Deployed addresses (contracts/deployments/10143.json). */
export const ADDRESSES = {
  factory: DEPLOYMENT.factory,
  router: DEPLOYMENT.router,
  lens: DEPLOYMENT.lens,
  market: DEPLOYMENT.market,
  oracle: DEPLOYMENT.oracle,
  usdc: DEPLOYMENT.usd,
  startBlock: String(DEPLOYMENT.startBlock),
} as const;

export const addressUrl = (address: string) => `${NETWORK.explorer}/address/${address}`;

type AbiItem = { type: string; name?: string };

export type AbiEntry = {
  slug: string;
  name: string;
  abi: AbiItem[];
};

/** Every ABI served under /docs/abis, in documentation order. */
export const ABIS: AbiEntry[] = [
  { slug: "basket-factory", name: "BasketFactory", abi: basketFactory },
  { slug: "basket-vault", name: "BasketVault", abi: basketVault },
  { slug: "basket-router", name: "BasketRouter", abi: basketRouter },
  { slug: "basket-lens", name: "BasketLens", abi: basketLens },
  { slug: "stock-market", name: "StockMarket", abi: stockMarket },
  { slug: "price-oracle", name: "PriceOracle", abi: priceOracle },
  { slug: "stock-token", name: "StockToken", abi: stockToken },
  { slug: "test-usd", name: "TestUSD", abi: testUsd },
];

export const abiPath = (slug: string) => `/docs/abis/${slug}.json`;

export function abiCounts(abi: AbiItem[]) {
  return {
    functions: abi.filter((item) => item.type === "function").length,
    events: abi.filter((item) => item.type === "event").length,
  };
}
