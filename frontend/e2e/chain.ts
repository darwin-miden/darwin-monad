import fs from "node:fs";
import path from "node:path";
import { createPublicClient, defineChain, http, parseAbi, parseEther, type Address, type Chain } from "viem";
import { monadTestnet } from "viem/chains";
import { IS_FORK, REPO_DIR, RPC_URL } from "./env";

export type Deployment = {
  chainId: number;
  startBlock: number;
  usd: Address;
  oracle: Address;
  market: Address;
  factory: Address;
  router: Address;
  lens: Address;
  symbols: string[];
  stocks: Address[];
};

export const deployment: Deployment = JSON.parse(
  fs.readFileSync(path.join(REPO_DIR, "contracts", "deployments", "10143.json"), "utf8"),
);

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
]);

export const testUsdAbi = parseAbi([
  "function faucet()",
  "function lastClaim(address) view returns (uint256)",
  "function FAUCET_AMOUNT() view returns (uint256)",
  "function FAUCET_COOLDOWN() view returns (uint256)",
  "error FaucetCooldown(uint256 availableAt)",
]);

export const factoryAbi = parseAbi([
  "function deployedCount() view returns (uint256)",
  "function deployed(uint256) view returns (address)",
  "function isBasket(address) view returns (bool)",
  "function deploy(string name, string symbol, string description, address[] tokens, uint256[] units, uint16 mintFeeBps, uint16 redeemFeeBps) returns (address)",
  "event BasketDeployed(address indexed vault, address indexed creator, string name, string symbol, uint256 index)",
]);

export const lensAbi = parseAbi([
  "struct Leg { address token; string symbol; uint256 units; uint256 price; uint256 value; uint256 weightBps; }",
  "struct BasketView { address vault; string name; string symbol; string description; address owner; uint256 totalSupply; uint256 nav; uint256 tvl; uint16 mintFeeBps; uint16 redeemFeeBps; uint64 createdAt; Leg[] legs; }",
  "struct Holding { address vault; string symbol; uint256 balance; uint256 value; }",
  "function getBasket(address vault) view returns (BasketView)",
  "function getBaskets(uint256 offset, uint256 limit) view returns (BasketView[])",
  "function getHoldings(address user) view returns (Holding[])",
]);

export const routerAbi = parseAbi([
  "function quoteBuy(address vault, uint256 usdIn) view returns (uint256)",
  "function quoteBuyExact(address vault, uint256 shares) view returns (uint256)",
  "function quoteSell(address vault, uint256 shares) view returns (uint256)",
  "function buy(address vault, uint256 usdIn, uint256 minShares, address to, uint256 deadline) returns (uint256)",
  "function buyExact(address vault, uint256 shares, uint256 maxUsdIn, address to, uint256 deadline) returns (uint256)",
  "function sell(address vault, uint256 shares, uint256 minUsdOut, address to, uint256 deadline) returns (uint256)",
]);

export const vaultAbi = parseAbi([
  "function constituents() view returns (address[] tokens, uint256[] unitsPerShare)",
  "function previewMint(uint256 shares) view returns (uint256[])",
  "function previewRedeem(uint256 shares) view returns (uint256[])",
  "function mint(uint256 shares, address to, uint256[] maxIn, uint256 deadline) returns (uint256[])",
  "function redeem(uint256 shares, address to, uint256[] minOut, uint256 deadline) returns (uint256[])",
  "function owner() view returns (address)",
  "function mintFeeBps() view returns (uint16)",
  "function redeemFeeBps() view returns (uint16)",
]);

/** Every write the app can send, used to label recorded transactions. */
export const writeAbis = [...erc20Abi, ...testUsdAbi, ...factoryAbi, ...routerAbi, ...vaultAbi];

export const chain: Chain =
  deployment.chainId === monadTestnet.id
    ? { ...monadTestnet, rpcUrls: { default: { http: [RPC_URL] } } }
    : defineChain({
        id: deployment.chainId,
        name: `chain-${deployment.chainId}`,
        nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 },
        rpcUrls: { default: { http: [RPC_URL] } },
      });

export const publicClient = createPublicClient({ chain, transport: http(RPC_URL, { retryCount: 3 }) });

// ------------------------------------------------------------------ reads

export const nativeBalance = (addr: Address) => publicClient.getBalance({ address: addr });

export const usdcBalance = (addr: Address) =>
  publicClient.readContract({ address: deployment.usd, abi: erc20Abi, functionName: "balanceOf", args: [addr] });

export const shareBalance = (vault: Address, addr: Address) =>
  publicClient.readContract({ address: vault, abi: erc20Abi, functionName: "balanceOf", args: [addr] });

export const allowance = (token: Address, owner: Address, spender: Address) =>
  publicClient.readContract({ address: token, abi: erc20Abi, functionName: "allowance", args: [owner, spender] });

/** Balance of every constituent of `vault` held by `addr`, keyed by token address. */
export async function stockBalances(vault: Address, addr: Address): Promise<Record<Address, bigint>> {
  const [tokens] = await publicClient.readContract({ address: vault, abi: vaultAbi, functionName: "constituents" });
  const balances = await Promise.all(
    tokens.map((t) => publicClient.readContract({ address: t, abi: erc20Abi, functionName: "balanceOf", args: [addr] })),
  );
  return Object.fromEntries(tokens.map((t, i) => [t, balances[i]]));
}

export const basketCount = () =>
  publicClient.readContract({ address: deployment.factory, abi: factoryAbi, functionName: "deployedCount" });

export const getBasket = (vault: Address) =>
  publicClient.readContract({ address: deployment.lens, abi: lensAbi, functionName: "getBasket", args: [vault] });

export async function allBaskets() {
  const count = await basketCount();
  return publicClient.readContract({
    address: deployment.lens,
    abi: lensAbi,
    functionName: "getBaskets",
    args: [BigInt(0), count],
  });
}

/** Most recently deployed basket with this ticker, or undefined. */
export async function findBasketBySymbol(symbol: string) {
  const baskets = await allBaskets();
  return [...baskets].reverse().find((b) => b.symbol === symbol);
}

export const holdings = (addr: Address) =>
  publicClient.readContract({ address: deployment.lens, abi: lensAbi, functionName: "getHoldings", args: [addr] });

export const quoteBuy = (vault: Address, usdIn: bigint) =>
  publicClient.readContract({ address: deployment.router, abi: routerAbi, functionName: "quoteBuy", args: [vault, usdIn] });

export const quoteSell = (vault: Address, shares: bigint) =>
  publicClient.readContract({ address: deployment.router, abi: routerAbi, functionName: "quoteSell", args: [vault, shares] });

// ------------------------------------------------------------------ fork-only cheats

function assertFork(what: string) {
  const local = /^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?/.test(RPC_URL);
  if (!IS_FORK || !local || deployment.chainId !== 10143) throw new Error(`${what} is only available on the local fork`);
}

/** Gives `addr` 100 MON on the fork (anvil_setBalance). */
export async function fund(addr: Address, amount = parseEther("100")) {
  assertFork("fund()");
  await publicClient.request({
    method: "anvil_setBalance" as never,
    params: [addr, `0x${amount.toString(16)}`] as never,
  });
}

/** Moves fork time past the USDC faucet cooldown for `addr`, if it is still running. */
export async function skipFaucetCooldown(addr: Address) {
  assertFork("skipFaucetCooldown()");
  const [last, cooldown, block] = await Promise.all([
    publicClient.readContract({ address: deployment.usd, abi: testUsdAbi, functionName: "lastClaim", args: [addr] }),
    publicClient.readContract({ address: deployment.usd, abi: testUsdAbi, functionName: "FAUCET_COOLDOWN" }),
    publicClient.getBlock(),
  ]);
  if (last === BigInt(0) || block.timestamp >= last + cooldown) return;
  const wait = Number(last + cooldown - block.timestamp) + 1;
  await publicClient.request({ method: "evm_increaseTime" as never, params: [wait] as never });
  await publicClient.request({ method: "evm_mine" as never, params: [] as never });
}

/** True when the faucet can be claimed by `addr` right now. */
export async function faucetReady(addr: Address) {
  const [last, cooldown, block] = await Promise.all([
    publicClient.readContract({ address: deployment.usd, abi: testUsdAbi, functionName: "lastClaim", args: [addr] }),
    publicClient.readContract({ address: deployment.usd, abi: testUsdAbi, functionName: "FAUCET_COOLDOWN" }),
    publicClient.getBlock(),
  ]);
  return last === BigInt(0) || block.timestamp >= last + cooldown;
}
