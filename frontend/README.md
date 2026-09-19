# Darwin — frontend

Trade a portfolio of tokenized stocks as one share, on Monad.

Next.js (App Router) + CSS modules, wagmi/viem for the wallet (Monad Testnet), `shaders` for the hero background.

```bash
pnpm install
pnpm dev        # http://localhost:3000
pnpm build
```

## Pages

| Route | What |
| --- | --- |
| `/` | Hero, featured basket, top baskets by capacity |
| `/baskets` | Browse, search, filter and sort baskets |
| `/basket/[address]` | NAV chart / composition, buy · sell · deposit · redeem |
| `/create` | Pick assets, set weights, name, ticker and starting NAV |
| `/portfolio` | Connected wallet's positions, performance and exposure |
| `/leaderboard` | Basket creators ranked by backed value, baskets or capacity |
| `/docs` | Protocol and integration docs |
| `/stock/[symbol]` | Single asset view (not linked from the nav) |

## Data

The contracts aren't deployed yet, so the app runs on demo data:

- `lib/data/snapshot.json` — assets and baskets (prices, weights, liquidity depth).
- `lib/data/store.tsx` — `DarwinProvider` and hooks (`useBaskets`, `useBasket`, `useAssets`, `useHoldings`). Trades and created baskets are simulated and persisted in `localStorage` (`darwin-demo-v1`).
- `lib/navHistory.ts` — deterministic NAV history until an indexer/oracle history exists.

To go on-chain, swap the store's internals for `BasketLens` reads (`getBaskets`, `getBasket`, `getAssets`, `getHoldings`) and route writes through `BasketRouter` / `BasketVault` / `BasketFactory`; component code only talks to the hooks.

## Wallet

`lib/wallet.ts` configures wagmi for Monad Testnet (chain 10143). It uses the browser's injected wallet when there is one, and falls back to a mock demo account otherwise so the whole flow stays clickable.
