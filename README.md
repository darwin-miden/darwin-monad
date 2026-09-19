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

| Contract | Address |
| --- | --- |
| BasketFactory | [`0x041A8dE9B3FBa4F8bf4fb7901d74703D5bA4818E`](https://testnet.monadexplorer.com/address/0x041A8dE9B3FBa4F8bf4fb7901d74703D5bA4818E) |
| BasketRouter | [`0xe90a46af27E4b3Ebbb748EceaB33346F33Ea23bB`](https://testnet.monadexplorer.com/address/0xe90a46af27E4b3Ebbb748EceaB33346F33Ea23bB) |
| BasketLens | [`0x785b2Cb17510Ce95e21bE31E4F3f996Fb7985d4a`](https://testnet.monadexplorer.com/address/0x785b2Cb17510Ce95e21bE31E4F3f996Fb7985d4a) |
| PriceOracle | [`0xC568B498B6FdE53b0DEED570CBC28C0f940cfC5a`](https://testnet.monadexplorer.com/address/0xC568B498B6FdE53b0DEED570CBC28C0f940cfC5a) |
| StockMarket | [`0x9c0E19a740559C5a974351C99862793F9961640d`](https://testnet.monadexplorer.com/address/0x9c0E19a740559C5a974351C99862793F9961640d) |
| TestUSD (USDC) | [`0x2a1b795E524E155BFAb28699D94C496EE93b0b3f`](https://testnet.monadexplorer.com/address/0x2a1b795E524E155BFAb28699D94C496EE93b0b3f) |

Tokenized stocks: [AAPL](https://testnet.monadexplorer.com/address/0x21Fd949D905e576bAF5bc2f0D912b3e4d0989D0B) · [MSFT](https://testnet.monadexplorer.com/address/0xd51B554259c1aA858CB3B145E6b73Dd195DE59a1) · [NVDA](https://testnet.monadexplorer.com/address/0x72733B57EF063faed48348b0c8F8850638B72B8A) · [GOOGL](https://testnet.monadexplorer.com/address/0xB54e1e874D91bc5D4D4736A2502A9364CFa0b872) · [AMZN](https://testnet.monadexplorer.com/address/0x3965E319a939d057cc2AEA60B1AA469267672b43) · [META](https://testnet.monadexplorer.com/address/0x65a2349f3D363608a4d3472c3D0a033005fD42Ae) · [TSLA](https://testnet.monadexplorer.com/address/0x68018d90fc7c26fEE4F04De46BeCFcCba1Fe2D1F) · [AVGO](https://testnet.monadexplorer.com/address/0x5FF730eAB4ae0F3C6E14466140F37daF91cFeD33) · [AMD](https://testnet.monadexplorer.com/address/0x4be29df73b88c6D62d6d422aB016908A46f0f818) · [NFLX](https://testnet.monadexplorer.com/address/0xDDE9A88E7fEAB4dCEB0A5eB97E4c8E286B44aC49) · [PLTR](https://testnet.monadexplorer.com/address/0x344C8022C1c3822A4899EB21f83cfC68700B4535) · [COIN](https://testnet.monadexplorer.com/address/0x3d98BcD2Daf1F23481aa11eBb28c2dd35d9C71c8) · [MSTR](https://testnet.monadexplorer.com/address/0x3671B3B4EC4a4Aa7628D515b19e233508321eCFA) · [HOOD](https://testnet.monadexplorer.com/address/0x70378098d5FB1016b3f40D1d872140e739E86c2C)

Starter baskets (launched at $100 / share, weights at launch):

| Basket | Symbol | Vault | Composition |
| --- | --- | --- | --- |
| Magnificent 7 | `MAG7` | [`0xA14dBbbE…`](https://testnet.monadexplorer.com/address/0xA14dBbbE353E630fa30D9f06Da1e45a29dbC1A71) | AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA |
| AI Compute | `AICORE` | [`0x51627184…`](https://testnet.monadexplorer.com/address/0x51627184d7f0CF98abdA56239461109c31AD4D63) | NVDA 40, AVGO 25, AMD 20, PLTR 15 |
| Crypto Equities | `CRYPTO` | [`0xEB6B8236…`](https://testnet.monadexplorer.com/address/0xEB6B823679898dF1d62EF55AA04F1403D6e34769) | COIN 40, MSTR 30, HOOD 30 |
| AI & Big Tech Titans | `TITANS` | [`0xFd6DD238…`](https://testnet.monadexplorer.com/address/0xFd6DD238AB6c541BcDeaea4Af7ba119F8348B0bd) | META, GOOGL, NVDA, AAPL 25 each |
| Screen Time | `SCREEN` | [`0x10E46B48…`](https://testnet.monadexplorer.com/address/0x10E46B48b1ba05c010e35a627833E4f3448ab784) | NFLX 30, META 30, AAPL 20, AMZN 20 |

Machine-readable: [`contracts/deployments/10143.json`](contracts/deployments/10143.json).

## Repo layout

```
contracts/   Foundry project: src/, test/, script/Deploy.s.sol, deployments/
web/         Next.js app (Blend-style UI): baskets, basket detail + trade, create, portfolio, leaderboard, docs
scripts/     fetch-prices.py (deploy-time prices), seed.py (starter baskets), keeper.py (price keeper)
```

## Run it

```bash
git clone --recursive git@github.com:darwin-miden/darwin-monad.git
cd darwin-monad/contracts
forge test

# deploy (PRIVATE_KEY + RPC_URL in contracts/.env)
python3 ../scripts/fetch-prices.py
source .env && forge script script/Deploy.s.sol --rpc-url $RPC_URL --broadcast --slow
python3 ../scripts/seed.py              # starter baskets, gas estimated by the Monad node

# keep prices live (only pushes prices that moved)
python3 ../scripts/keeper.py            # checks every 60s

# app
cd ../web && pnpm install && pnpm dev
```

## Testnet caveats

- Stock tokens are synthetic testnet assets: they track real prices through the keeper-fed oracle, not real shares.
- The StockMarket is an oracle-priced issuer standing in for real per-stock liquidity.
- Not implemented from the reference design: issuance/redemption throttles, flash mint/redeem, constituent exclusion and recovery accounting, surplus accretion.

## Monad notes

- Forge's local simulation prices gas like Ethereum and under-estimates Monad's cold state access, and Monad bills the full gas limit. A 7-leg `router.buy` uses ~2.2M gas on Monad. `scripts/seed.py` asks the node for every estimate.
- A full basket purchase (7 stock legs + mint) is a single transaction that confirms in one Monad block.
