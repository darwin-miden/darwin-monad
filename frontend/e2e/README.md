# E2E

Playwright tests that drive the real app with a scripted wallet, against a fork of Monad testnet or the live testnet.

```bash
pnpm e2e:fork                      # anvil fork of Monad testnet on :8546 (started if missing), app on :3140
pnpm e2e:live                      # Monad testnet, key from frontend/.env.e2e, app on :3141
E2E_SERVER=prod pnpm e2e:fork      # next build + next start instead of next dev
pnpm exec playwright show-report e2e/report
```

## Wallet

`wallet.ts` injects `window.ethereum` before any app script runs. Every EIP-1193 request is bridged to Node, where
a viem account signs it, so the private key never enters the page.

- Behaves like a real wallet: `eth_accounts` stays empty until the site calls `eth_requestAccounts`, addresses come back lowercase, and `wallet_switchEthereumChain` only accepts the RPC's own chain.
- Gas limits and fees are filled from the node's estimate with no multiplier. Monad bills the full gas limit, so an estimate that is too low surfaces as a failed transaction instead of being hidden.
- Every sent transaction is written to `results/txs-<target>.json` with its label, gas limit, gas used, cost in MON and confirmation time. Sends that fail before reaching the chain go to `results/failed-sends-<target>.json`.

Helpers a spec can call:

| Call | Effect |
| --- | --- |
| `wallet.waitForTx()` / `waitForTxs(n)` | Waits for the next confirmed transaction(s) and returns their records. |
| `wallet.rejectNext()` | Rejects the next send with EIP-1193 code 4001, as if the user clicked Reject. |
| `wallet.setChainId(id)` | Reports another chain to the app. |
| `wallet.label(name)` | Sets the label recorded for the next transaction. |

`chain.ts` has on-chain reads for assertions: balances, baskets, holdings, quotes. It also has fork-only cheats:
- `fund(addr)`: gives the address 100 MON.
- `skipFaucetCooldown(addr)`: moves time past the USDC faucet cooldown.

## Targets

**Fork.** Uses a dedicated deterministic key, `keccak256("darwin-monad-e2e-fork-wallet")`, whose address is 0x50Fa…19D2. It is topped up to 100 MON before each test. anvil's default accounts are public keys that have been drained on the live testnet, and a fork inherits that state.

**Live.** Refuses to start below 0.3 MON (override with `E2E_MIN_MON`). The USDC faucet has a 1-hour cooldown per address on the live chain.

## Server isolation

Next 16 locks `.next/dev`, so a second `next dev` can't run next to your own dev server. `serve.mjs` rsyncs the worktree into `/tmp/darwin-e2e/<target>` and serves the app from there. `node_modules` is cloned copy-on-write and only re-cloned when `pnpm-lock.yaml` changes. The fork target sets `NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546`.
