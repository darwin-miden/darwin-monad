import { parseAbi, type Address } from "viem";
import deployment from "./data/deployment.json";

/** Live Darwin deployment on Monad Testnet (mirrors contracts/deployments/10143.json). */
export const DEPLOYMENT = deployment as {
  chainId: number;
  startBlock: number;
  usd: Address;
  oracle: Address;
  market: Address;
  factory: Address;
  router: Address;
  lens: Address;
  featured: Address;
  stocks: { symbol: string; name: string; address: Address }[];
};

export const USDC_DECIMALS = 6;
export const WAD = 10n ** 18n;
/** Fixed protocol fees charged by every BasketVault. */
export const PROTOCOL_MINT_FEE_BPS = 30;
export const PROTOCOL_REDEEM_FEE_BPS = 20;
/** StockMarket spread on each routed leg. */
export const MARKET_SPREAD_BPS = 10;

export const lensAbi = parseAbi([
  "struct Asset { address token; string symbol; string name; uint8 decimals; uint256 price; uint256 updatedAt; }",
  "struct Leg { address token; string symbol; uint256 units; uint256 price; uint256 value; uint256 weightBps; }",
  "struct BasketView { address vault; string name; string symbol; string description; address owner; uint256 totalSupply; uint256 nav; uint256 tvl; uint16 mintFeeBps; uint16 redeemFeeBps; uint64 createdAt; Leg[] legs; }",
  "struct Holding { address vault; string symbol; uint256 balance; uint256 value; }",
  "function getAssets() view returns (Asset[])",
  "function getBasket(address vault) view returns (BasketView)",
  "function getBaskets(uint256 offset, uint256 limit) view returns (BasketView[])",
  "function getHoldings(address user) view returns (Holding[])",
]);

export const routerAbi = parseAbi([
  "function quoteBuy(address vault, uint256 usdIn) view returns (uint256 shares)",
  "function quoteBuyExact(address vault, uint256 shares) view returns (uint256 usdIn)",
  "function quoteSell(address vault, uint256 shares) view returns (uint256 usdOut)",
  "function buy(address vault, uint256 usdIn, uint256 minShares, address to, uint256 deadline) returns (uint256 shares)",
  "function sell(address vault, uint256 shares, uint256 minUsdOut, address to, uint256 deadline) returns (uint256 usdOut)",
]);

export const vaultAbi = parseAbi([
  "function previewMint(uint256 shares) view returns (uint256[] amountsIn)",
  "function previewRedeem(uint256 shares) view returns (uint256[] amountsOut)",
  "function mint(uint256 shares, address to, uint256[] maxIn, uint256 deadline) returns (uint256[] amountsIn)",
  "function redeem(uint256 shares, address to, uint256[] minOut, uint256 deadline) returns (uint256[] amountsOut)",
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
]);

export const factoryAbi = parseAbi([
  "function deploy(string name, string symbol, string description, address[] tokens, uint256[] units, uint16 mintFeeBps, uint16 redeemFeeBps) returns (address vault)",
  "event BasketDeployed(address indexed vault, address indexed creator, string name, string symbol, uint256 index)",
]);

export const erc20Abi = parseAbi([
  "function balanceOf(address account) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
]);

export const testUsdAbi = parseAbi([
  "function faucet()",
  "function lastClaim(address account) view returns (uint256)",
  "function FAUCET_COOLDOWN() view returns (uint256)",
]);

export const deadline = (minutes = 20) => BigInt(Math.floor(Date.now() / 1000) + minutes * 60);

export const toWad = (n: number) => BigInt(Math.round(n * 1e9)) * 10n ** 9n;
export const fromWad = (n: bigint | undefined) => (n === undefined ? 0 : Number(n) / 1e18);
export const toUsdc = (n: number) => BigInt(Math.round(n * 1e6));
export const fromUsdc = (n: bigint | undefined) => (n === undefined ? 0 : Number(n) / 1e6);

/** Parses a user-typed decimal string into fixed-point units without float rounding. */
export function parseAmount(input: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = input.trim().split(".");
  if (!/^\d*$/.test(whole) || !/^\d*$/.test(frac)) return 0n;
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt((frac + "0".repeat(decimals)).slice(0, decimals) || "0");
}

/** Applies a slippage tolerance (e.g. 0.01) to a minimum-out amount. */
export const withSlippage = (amount: bigint, slippage: number) => (amount * BigInt(Math.round((1 - slippage) * 10_000))) / 10_000n;
