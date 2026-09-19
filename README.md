# Darwin on Monad

**Trade a portfolio as one share.** Darwin baskets are ERC-20 tokens backed by fixed units of tokenized US stocks, live on Monad Testnet. Pick stocks, set weights, deploy: anyone can buy the whole portfolio with USDC in one transaction, or redeem it back.

Built at **Monad Blitz Paris** (19 September 2026).

## How it works

One basket share (`1e18`) always maps to a fixed quantity of every constituent, for example `0.0425 AAPL + 0.0643 NVDA + ...`. Prices move the basket's value and its weights, but the token quantities never change. No rebalancing, no manager discretion: the NAV is `Σ units × price`.

```
            USDC                                   basket shares
  user ─────────────▶ BasketRouter ──── mint ────▶ BasketVault (ERC-20)
                          │  ▲                          │ holds every constituent
            buy each leg  │  │ sell each leg            │ fixed units per share
                          ▼  │                          │
                     StockMarket ◀── prices ── PriceOracle ◀── keeper (live market prices)
```

| Contract | Role |
| --- | --- |
| `BasketFactory` | Permissionless basket deployment over an allowlist of tokenized stocks (1–16 constituents). Lists every basket. |
| `BasketVault` | The basket token. Holds constituents, mints shares against the exact units (rounded up), redeems pro rata (rounded down). Tracks holder backing, owner fees and protocol fees in separate buckets. |
| `BasketRouter` | USDC ↔ basket in one transaction: buys every leg on the StockMarket and mints, or redeems and sells every leg. Exact-in buy, exact-out buy, sell, with slippage limits and deadlines. |
| `BasketLens` | Read-only aggregation for the app: assets and prices, basket composition, NAV, TVL, weights and holdings in one `eth_call`. |
| `StockMarket` | Testnet liquidity for tokenized stocks: issues and burns stock tokens against USDC at the oracle price with a 10 bps spread. On mainnet, routes would target real pools instead. |
| `PriceOracle` | Keeper-fed USD prices. `scripts/keeper.py` pushes live US equity prices for all 14 stocks in a single transaction. |
| `StockToken` / `TestUSD` | 18-decimal tokenized stocks (AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, AVGO, AMD, NFLX, PLTR, COIN, MSTR, HOOD) and a 6-decimal test USDC with a public faucet. |

### Two ways in and out

- **Routed:** `BasketRouter.buy(vault, usdcIn, minShares, to, deadline)` / `sell(vault, shares, minUsdcOut, to, deadline)`.
- **In kind:** `BasketVault.mint(shares, to, maxIn[], deadline)` if you already hold every constituent, `redeem(shares, to, minOut[], deadline)` to get the stocks back.

### Fees

Computed per constituent on every mint and redeem.

| Fee | Mint | Redeem | Goes to |
| --- | --- | --- | --- |
| Basket owner fee | 0–100 bps (set by creator) | 0–100 bps | `treasury[token]`, withdrawable by the basket owner |
| Protocol fee | 30 bps | 20 bps | `protocolFees[token]`, anyone can sweep it to the fee recipient |
| Market spread (routed only) | 10 bps | 10 bps | StockMarket reserve |

Holder backing can never be withdrawn by the owner or the protocol, and the backing invariant `backing[token] ≥ totalSupply × units / 1e18` holds by construction: mints round up and redemptions round down.

## Deployments (Monad Testnet, chain 10143)

Addresses are in [`contracts/deployments/10143.json`](contracts/deployments/10143.json).

## Repo layout

```
contracts/   Foundry project: src/, test/, script/Deploy.s.sol, deployments/
web/         Next.js app (Blend-style UI): baskets, basket detail + trade, create, portfolio, leaderboard, docs
scripts/     fetch-prices.py (deploy-time prices), keeper.py (price keeper)
```

## Run it

```bash
git clone --recursive git@github.com:darwin-miden/darwin-monad.git
cd darwin-monad/contracts
forge test

# deploy (PRIVATE_KEY + RPC_URL in contracts/.env)
python3 ../scripts/fetch-prices.py
source .env && forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast

# keep prices live
python3 ../scripts/keeper.py            # every 60s

# app
cd ../web && pnpm install && pnpm dev
```

## Testnet caveats

- Stock tokens are synthetic testnet assets: they track real prices through the keeper-fed oracle, not real shares.
- The StockMarket is an oracle-priced issuer standing in for real per-stock liquidity.
- Not implemented from the reference design: issuance/redemption throttles, flash mint/redeem, constituent exclusion and recovery accounting, surplus accretion.
