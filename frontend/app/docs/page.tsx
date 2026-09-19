import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ABIS, ADDRESSES, NETWORK, abiCounts, abiPath, addressUrl } from "./contracts";
import { DocsNavigation, DocsSearch, type DocsNavGroup, type DocsSearchItem } from "./DocsNavigation";
import styles from "./docs.module.css";

export const metadata: Metadata = {
  title: "Documentation",
  description: "Read baskets, quote trades, submit transactions, and index Darwin on Monad.",
};

const NAV: DocsNavGroup[] = [
  {
    label: "Protocol",
    links: [
      ["overview", "Protocol architecture"],
      ["model", "Basket accounting"],
      ["transactions", "Transaction methods"],
      ["economics", "Fees and limits"],
      ["failures", "Failure modes"],
    ],
  },
  {
    label: "Integration",
    links: [
      ["network", "Network setup"],
      ["contracts", "Contract reference"],
      ["integration", "Integration workflow"],
      ["events", "Indexing"],
    ],
  },
  {
    label: "Reference",
    links: [
      ["roles", "Permissions"],
      ["risks", "Risks"],
    ],
  },
];

const SEARCH: DocsSearchItem[] = [
  {
    group: "Protocol",
    title: "Protocol architecture",
    description: "Contracts, basket shares, and the backing requirement.",
    href: "#overview",
    keywords: "factory vault router lens market oracle",
  },
  {
    group: "Protocol",
    title: "Units and backing",
    description: "How units per share and vault balances are accounted for.",
    href: "#units-and-backing",
    keywords: "units backing treasury protocolFees",
  },
  {
    group: "Protocol",
    title: "Basket lifecycle",
    description: "Deploy, price, operate, and maintain a basket.",
    href: "#basket-lifecycle",
  },
  {
    group: "Protocol",
    title: "Transaction methods",
    description: "Direct mint and redeem, routed buy, buy exact, and sell.",
    href: "#transactions",
    keywords: "mint redeem buy buyExact sell approve",
  },
  {
    group: "Protocol",
    title: "Fee calculation",
    description: "Owner and Darwin fee calculations for mint and redemption.",
    href: "#fee-settlement",
    keywords: "bps mintFeeBps redeemFeeBps protocol",
  },
  {
    group: "Protocol",
    title: "Onchain fee buckets",
    description: "Owner treasury, protocol fees, and the market spread.",
    href: "#onchain-fee-buckets",
    keywords: "treasury protocolFees sweepProtocolFees withdrawTreasury spread",
  },
  {
    group: "Protocol",
    title: "Execution limits",
    description: "Minimum mint, constituent count, fee caps, and spread.",
    href: "#execution-limits",
    keywords: "MIN_MINT_SHARES MAX_CONSTITUENTS spreadBps",
  },
  {
    group: "Protocol",
    title: "Failure modes",
    description: "Missing prices, reserve shortfalls, deadlines, and slippage.",
    href: "#failures",
    keywords: "NoPrice Expired Slippage LimitExceeded revert",
  },
  {
    group: "Integration",
    title: "Network setup",
    description: "Monad Testnet RPC, chain ID, quote asset, and decimals.",
    href: "#network",
    keywords: "monad 10143 rpc explorer usdc",
  },
  {
    group: "Integration",
    title: "Contract reference",
    description: "Deployed contracts, addresses, ABIs, and discovery rules.",
    href: "#contracts",
  },
  {
    group: "Integration",
    title: "Shared infrastructure",
    description: "USDC, stock tokens, and Multicall3.",
    href: "#shared-infrastructure",
    keywords: "TestUSD faucet multicall",
  },
  {
    group: "Integration",
    title: "Integration workflow",
    description: "Contract calls for common read, quote, and transaction tasks.",
    href: "#integration",
    keywords: "getBasket getAssets getHoldings quoteBuy",
  },
  {
    group: "Integration",
    title: "Indexing",
    description: "Events to index and where to start.",
    href: "#events",
    keywords: "events logs BasketDeployed Minted Redeemed",
  },
  {
    group: "Reference",
    title: "Permissions",
    description: "Basket owner, factory, market, oracle, and permissionless actions.",
    href: "#roles",
    keywords: "owner keeper admin",
  },
  {
    group: "Reference",
    title: "Risks",
    description: "Asset, oracle, issuer, liquidity, and execution risks.",
    href: "#risks",
  },
  ...ABIS.slice(0, 6).map(({ name, slug }) => ({
    group: "ABI downloads",
    title: `${name} ABI`,
    description: `Download the machine-readable ${name} interface.`,
    href: abiPath(slug),
  })),
];

const CONTRACTS: { name: string; slug: string; summary: string; address: ReactNode; methods: string }[] = [
  {
    name: "BasketFactory",
    slug: "basket-factory",
    summary: "Deploys vaults over the stock allowlist and records every canonical basket.",
    address: ADDRESSES.factory,
    methods: "deploy, deployed, deployedCount, baskets, isBasket, assets",
  },
  {
    name: "BasketVault",
    slug: "basket-vault",
    summary: "ERC-20 basket share: custody, units, fees, and redemption.",
    address: (
      <span>
        Read <code>BasketDeployed.vault</code>
      </span>
    ),
    methods: "constituents, previewMint, previewRedeem, mint, redeem, treasury, protocolFees, sweepProtocolFees",
  },
  {
    name: "BasketRouter",
    slug: "basket-router",
    summary: "Converts between USDC and complete basket shares in one transaction.",
    address: ADDRESSES.router,
    methods: "quoteBuy, quoteBuyExact, quoteSell, buy, buyExact, sell",
  },
  {
    name: "BasketLens",
    slug: "basket-lens",
    summary: "Read surface for assets, compositions, NAV, and holdings.",
    address: ADDRESSES.lens,
    methods: "getAssets, getBasket, getBaskets, getHoldings",
  },
  {
    name: "StockMarket",
    slug: "stock-market",
    summary: "Oracle-priced issuer that mints and burns stock tokens against USDC.",
    address: ADDRESSES.market,
    methods: "quoteBuyExactOut, quoteBuy, quoteSell, buyExactOut, buy, sell, spreadBps",
  },
  {
    name: "PriceOracle",
    slug: "price-oracle",
    summary: "Keeper-pushed USD prices for every listed stock.",
    address: ADDRESSES.oracle,
    methods: "getPrice, getPriceData, setPrices, isKeeper",
  },
];

function AddressLink({ address }: { address: string }) {
  return (
    <a href={addressUrl(address)} target="_blank" rel="noreferrer" className={styles.addressLink}>
      <code>{address}</code>
      <span aria-hidden="true">↗</span>
    </a>
  );
}

function Address({ value }: { value: ReactNode }) {
  if (typeof value === "string" && value) return <AddressLink address={value} />;
  if (value) return value;
  return <span>Not deployed yet</span>;
}

const explorerHost = NETWORK.explorer.replace("https://", "");

export default function DocsPage() {
  return (
    <main className={styles.page}>
      <div className={styles.docsBar}>
        <div className={styles.docsBarInner}>
          <a className={styles.docsBrand} href="/docs">
            <b>Darwin</b>
            <span aria-hidden="true">/</span>
            <em>Documentation</em>
          </a>
          <DocsSearch items={SEARCH} />
          <nav className={styles.docsBarLinks} aria-label="Documentation resources">
            <a href="#contracts">Contracts</a>
            <a href="/docs/abis" target="_blank">
              ABIs
            </a>
            <a href={NETWORK.explorer} target="_blank" rel="noreferrer">
              Explorer
            </a>
          </nav>
        </div>
      </div>
      <div className={styles.docsLayout}>
        <DocsNavigation groups={NAV} />
        <article className={styles.document}>
          <header className={styles.articleHeader}>
            <div className={styles.breadcrumb}>
              <span>Documentation</span>
              <span>/</span>
              <b>Darwin protocol</b>
            </div>
            <h1>Darwin developer docs</h1>
            <p>Read baskets, quote trades, submit transactions, and index Darwin on Monad.</p>
          </header>

          <section id="overview" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Protocol architecture</h2>
              <p>Darwin baskets are ERC-20 tokens backed by fixed quantities of tokenized stocks.</p>
            </header>
            <div className={styles.prose}>
              <p>
                One share maps to a fixed amount of every constituent in its vault. Prices change the basket&apos;s value and
                percentage weights, but they never rebalance the underlying tokens: units are set at deployment and no method
                changes them.
              </p>
              <p>
                A user who already holds every constituent can mint through the vault. A user who starts with USDC can use the
                router, which buys every constituent from the stock market and mints the share, or redeems the share and sells
                every constituent back. The legs and the share issuance or redemption execute atomically in one transaction.
              </p>
            </div>
            <div className={styles.invariant}>
              <span>Backing requirement</span>
              <p>Every constituent&apos;s backing covers its units across all outstanding basket shares.</p>
            </div>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Responsibilities</th>
                    <th>Key restriction</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Factory</td>
                    <td>Deploys baskets over an allowlist of stocks and lists canonical vaults</td>
                    <td>Only allowlisted assets can be constituents</td>
                  </tr>
                  <tr>
                    <td>Vault</td>
                    <td>Holds constituents, issues shares, and processes redemption</td>
                    <td>Holder backing is unavailable for administrative withdrawal</td>
                  </tr>
                  <tr>
                    <td>Router</td>
                    <td>Converts between USDC and complete basket shares</td>
                    <td>The caller supplies slippage limits and deadlines</td>
                  </tr>
                  <tr>
                    <td>Market</td>
                    <td>Mints stock tokens against USDC and burns them on sells, at the oracle price plus a spread</td>
                    <td>Only listed stocks; spread capped at 100 bps</td>
                  </tr>
                  <tr>
                    <td>Oracle</td>
                    <td>Stores the USD price of every stock, pushed by a keeper</td>
                    <td>Only keepers can publish prices</td>
                  </tr>
                  <tr>
                    <td>Lens</td>
                    <td>
                      Returns assets, compositions, NAV, and holdings through <code>eth_call</code>
                    </td>
                    <td>Read-only; no asset transfers</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section id="model" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Basket accounting</h2>
              <p>Each basket specifies a quantity of every constituent token per share.</p>
            </header>
            <div className={styles.prose}>
              <h3 id="units-and-backing">Units and backing</h3>
              <p>
                <code>units(token)</code> tells you how much of a constituent belongs to one full basket share (
                <code>1e18</code>). <code>backing(token)</code> is the amount reserved for every holder. Owner revenue lives in{" "}
                <code>treasury(token)</code> and protocol revenue in <code>protocolFees(token)</code>, both separate from
                backing.
              </p>
              <p>
                Market price changes do not modify these accounting values. Mints add to backing and redemptions remove from
                it; fees only ever flow into the two fee buckets. There is no rebalancing, accretion, or write-down path.
              </p>
              <h3 id="basket-lifecycle">Basket lifecycle</h3>
              <ol className={styles.steps}>
                <li>
                  <b>Deploy</b>
                  <span>
                    Choose 1–16 allowlisted stocks, their units per share, and owner mint and redeem fees. The caller becomes
                    the basket owner.
                  </span>
                </li>
                <li>
                  <b>Price</b>
                  <span>
                    A keeper publishes each stock&apos;s USD price to the oracle. NAV, lens reads, and router quotes use the
                    latest price.
                  </span>
                </li>
                <li>
                  <b>Operate</b>
                  <span>
                    Users mint and redeem directly, or buy and sell with USDC through the router. The vault checks minimum
                    size, limits, and deadlines.
                  </span>
                </li>
                <li>
                  <b>Maintain</b>
                  <span>
                    The owner can update fees, transfer ownership, and withdraw treasury. Anyone can sweep protocol fees to
                    the fee recipient.
                  </span>
                </li>
              </ol>
            </div>
          </section>

          <section id="transactions" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Transaction methods</h2>
              <p>Vault methods accept constituent tokens directly. Router methods accept or return USDC.</p>
            </header>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Method</th>
                    <th>Input</th>
                    <th>Validation parameters</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Direct mint</td>
                    <td>
                      <code>BasketVault.mint</code>
                    </td>
                    <td>Every constituent</td>
                    <td>
                      <code>maxIn[]</code> (optional) and <code>deadline</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Direct redeem</td>
                    <td>
                      <code>BasketVault.redeem</code>
                    </td>
                    <td>Basket shares</td>
                    <td>
                      <code>minOut[]</code> (optional) and <code>deadline</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Exact-input buy</td>
                    <td>
                      <code>BasketRouter.buy</code>
                    </td>
                    <td>USDC</td>
                    <td>
                      <code>minShares</code> and <code>deadline</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Exact-output buy</td>
                    <td>
                      <code>BasketRouter.buyExact</code>
                    </td>
                    <td>USDC</td>
                    <td>
                      <code>maxUsdIn</code> and <code>deadline</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Sell</td>
                    <td>
                      <code>BasketRouter.sell</code>
                    </td>
                    <td>Basket shares</td>
                    <td>
                      <code>minUsdOut</code> and <code>deadline</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.note}>
              <b>Token approvals.</b> Approve every constituent to the vault for a direct mint. Approve USDC to the router for a
              buy, or basket shares to the router for a sell. Both buys refund unspent USDC to the caller.
            </div>
          </section>

          <section id="economics" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Fees and limits</h2>
              <p>Fees are calculated independently for each constituent using the current vault configuration.</p>
            </header>
            <p>
              Every mint and redemption charges each constituent separately. The vault adds a basket-owner fee and a fixed
              Darwin protocol fee of<code> 30</code> bps on mint and<code> 20</code> bps on redeem. Routed trades also pay the
              stock market&apos;s spread on every leg, set to<code> 10</code> bps at deployment.
            </p>
            <h3 id="fee-settlement" className={styles.subheading}>
              Fee calculation
            </h3>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Fee component</th>
                    <th>Formula for one constituent</th>
                    <th>Accounting bucket</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Mint backing</td>
                    <td>
                      <code>ceil(shares * units / 1e18)</code>
                    </td>
                    <td>Holder backing</td>
                  </tr>
                  <tr>
                    <td>Mint owner fee</td>
                    <td>
                      <code>ceil(base * mintFeeBps / 10,000)</code>
                    </td>
                    <td>
                      <code>treasury[token]</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Mint protocol fee</td>
                    <td>
                      <code>ceil(base * 30 / 10,000)</code>
                    </td>
                    <td>
                      <code>protocolFees[token]</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Redeem gross</td>
                    <td>
                      <code>floor(shares * units / 1e18)</code>
                    </td>
                    <td>Removed from holder backing</td>
                  </tr>
                  <tr>
                    <td>Redeem owner fee</td>
                    <td>
                      <code>floor(gross * redeemFeeBps / 10,000)</code>
                    </td>
                    <td>
                      <code>treasury[token]</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Redeem protocol fee</td>
                    <td>
                      <code>floor(gross * 20 / 10,000)</code>
                    </td>
                    <td>
                      <code>protocolFees[token]</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Redeem payout</td>
                    <td>
                      <code>gross - owner fee - protocol fee</code>
                    </td>
                    <td>Sent to the recipient</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={styles.afterTable}>
              Each basket sets its mint and redeem owner fees separately, up to <code>100</code> bps (1%). Read{" "}
              <code>mintFeeBps()</code> and <code>redeemFeeBps()</code> instead of assuming the maximum. Mint calculations round
              up; redemption calculations round down. Use<code> previewMint</code> and <code>previewRedeem</code> for the exact
              token amounts.
            </p>
            <h3 id="onchain-fee-buckets" className={styles.subheading}>
              Onchain fee buckets
            </h3>
            <dl className={styles.definitionList}>
              <div>
                <dt>
                  <code>treasury[token]</code>
                </dt>
                <dd>
                  Basket-owner revenue. Only the owner can withdraw it, for every constituent at once, with{" "}
                  <code>withdrawTreasury(to)</code>.
                </dd>
              </div>
              <div>
                <dt>
                  <code>protocolFees[token]</code>
                </dt>
                <dd>
                  Anyone may call <code>sweepProtocolFees()</code>; the complete bucket goes to the factory&apos;s{" "}
                  <code>feeRecipient()</code>.
                </dd>
              </div>
              <div>
                <dt>Market spread</dt>
                <dd>
                  Routed trades pay <code>spreadBps</code> on each leg into the stock market&apos;s USDC reserve. The vault does
                  not see or split it.
                </dd>
              </div>
            </dl>
            <div className={styles.note}>
              <b>Example.</b> If one share needs 100 units of a constituent and the owner fee is 10 bps, minting transfers{" "}
              <code>100 + 0.10 + 0.30 = 100.40</code> units. Redeeming a gross 100 units pays{" "}
              <code>100 - 0.10 - 0.20 = 99.70</code> units. Integer rounding and the market spread are omitted here.
            </div>
            <h3 id="execution-limits" className={styles.subheading}>
              Execution limits
            </h3>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Limit</th>
                    <th>Definition</th>
                    <th>Integration impact</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Minimum mint</td>
                    <td>0.001 shares</td>
                    <td>
                      Smaller mints revert with <code>BelowMinimum</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Constituents</td>
                    <td>1 to 16 per basket, no duplicates</td>
                    <td>
                      Deployment reverts with <code>InvalidConstituents</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Owner fees</td>
                    <td>At most 100 bps each</td>
                    <td>
                      <code>setFees</code> reverts with <code>FeeTooHigh</code>
                    </td>
                  </tr>
                  <tr>
                    <td>Market spread</td>
                    <td>Flat spread around the oracle price, at most 100 bps</td>
                    <td>Only applies to router trades</td>
                  </tr>
                  <tr>
                    <td>Oracle price</td>
                    <td>Required for every constituent</td>
                    <td>
                      Market quotes revert with <code>NoPrice</code> until the keeper publishes
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={styles.afterTable}>
              <code>BasketRouter.quoteBuyExact(vault, 1e18)</code> returns the USDC cost of one share, vault fees and spread
              included. <code>quoteBuy</code> keeps two USDC units of headroom per constituent to absorb rounding.
            </p>
          </section>

          <section id="failures" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Failure modes</h2>
              <p>Darwin has no pause or recovery switches. These are the conditions an integration should handle.</p>
            </header>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Condition</th>
                    <th>Protocol behavior</th>
                    <th>Integration requirement</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>A constituent has no oracle price</td>
                    <td>
                      Market quotes revert with <code>NoPrice</code>, so router buys and sells revert.
                    </td>
                    <td>Keep direct mint and redemption available; they do not read prices.</td>
                  </tr>
                  <tr>
                    <td>An oracle price is stale</td>
                    <td>
                      No onchain staleness check. <code>getPriceData</code> returns <code>updatedAt</code>.
                    </td>
                    <td>Show the price age and warn before routed trades.</td>
                  </tr>
                  <tr>
                    <td>The market&apos;s USDC reserve is short</td>
                    <td>
                      <code>StockMarket.sell</code> cannot pay out, so <code>BasketRouter.sell</code> reverts.
                    </td>
                    <td>
                      Offer <code>BasketVault.redeem</code> to exit in kind.
                    </td>
                  </tr>
                  <tr>
                    <td>The deadline passes</td>
                    <td>
                      Vault and router revert with <code>Expired</code>.
                    </td>
                    <td>Refresh the quote and resubmit.</td>
                  </tr>
                  <tr>
                    <td>Execution moves past the limit</td>
                    <td>
                      Router reverts with <code>Slippage</code>; vault with <code>LimitExceeded(index)</code>.
                    </td>
                    <td>Surface the failing bound and re-quote.</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.note}>
              <b>Redemption stays open.</b> No role can pause a vault, exclude a constituent, or withdraw holder backing.
              Redeeming through the vault works as long as the constituent tokens transfer.
            </div>
          </section>

          <section id="network" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Network setup</h2>
              <p>The following values are used for wallet configuration, contract reads, and event backfills.</p>
            </header>
            <dl className={styles.definitionList}>
              <div>
                <dt>Network</dt>
                <dd>{NETWORK.name}</dd>
              </div>
              <div>
                <dt>Chain ID</dt>
                <dd>
                  <code>{NETWORK.chainId}</code>
                </dd>
              </div>
              <div>
                <dt>Native asset</dt>
                <dd>{NETWORK.native}</dd>
              </div>
              <div>
                <dt>Public RPC</dt>
                <dd>
                  <code>{NETWORK.rpc}</code>
                </dd>
              </div>
              <div>
                <dt>Explorer</dt>
                <dd>
                  <a href={NETWORK.explorer} target="_blank" rel="noreferrer">
                    {explorerHost} ↗
                  </a>
                </dd>
              </div>
              <div>
                <dt>Factory start block</dt>
                <dd>{ADDRESSES.startBlock ? <code>{Number(ADDRESSES.startBlock).toLocaleString("en-US")}</code> : "Not deployed yet"}</dd>
              </div>
              <div>
                <dt>Share and stock decimals</dt>
                <dd>
                  <code>18</code>
                </dd>
              </div>
              <div>
                <dt>Quote asset</dt>
                <dd>USDC, a 6-decimal test dollar with a public faucet</dd>
              </div>
            </dl>
          </section>

          <section id="contracts" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Contract reference</h2>
              <p>Fetch an ABI directly from this site, or use the manifest to resolve every contract.</p>
            </header>
            <pre className={styles.codeBlock}>
              <code>{["GET /docs/abis", ...ABIS.slice(0, 6).map(({ slug }) => `GET ${abiPath(slug)}`)].join("\n")}</code>
            </pre>
            <div className={styles.tableWrap}>
              <table className={styles.contractTable}>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Address or discovery</th>
                    <th>ABI</th>
                    <th>Primary methods</th>
                  </tr>
                </thead>
                <tbody>
                  {CONTRACTS.map((c) => {
                    const abi = ABIS.find((a) => a.slug === c.slug)!.abi;
                    const { functions, events } = abiCounts(abi);
                    return (
                      <tr key={c.name}>
                        <td>
                          <b>{c.name}</b>
                          <span>{c.summary}</span>
                        </td>
                        <td>
                          <Address value={c.address} />
                        </td>
                        <td>
                          <a href={abiPath(c.slug)} target="_blank" className={styles.abiLink}>
                            JSON ↗
                          </a>
                          <span>
                            {functions} functions · {events} events
                          </span>
                        </td>
                        <td>
                          <code>{c.methods}</code>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <h3 id="shared-infrastructure" className={styles.subheading}>
              Shared infrastructure
            </h3>
            <dl className={styles.definitionList}>
              <div>
                <dt>USDC (TestUSD)</dt>
                <dd>
                  <Address value={ADDRESSES.usdc} />
                </dd>
              </div>
              <div>
                <dt>USDC faucet</dt>
                <dd>
                  <code>faucet()</code> mints 10,000 USDC, once per hour per address
                </dd>
              </div>
              <div>
                <dt>Stock tokens</dt>
                <dd>
                  Read <code>BasketFactory.assets()</code> or <code>StockMarket.stocks()</code>
                </dd>
              </div>
              <div>
                <dt>Multicall3</dt>
                <dd>
                  <AddressLink address={NETWORK.multicall3} />
                </dd>
              </div>
            </dl>
          </section>

          <section id="integration" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Integration workflow</h2>
              <p>Start at the factory, read each basket through the lens, then use the router for quotes and trades.</p>
            </header>
            <h3 id="load-an-abi">Loading ABIs</h3>
            <pre className={styles.codeBlock}>
              <code>{`const manifest = await fetch("/docs/abis").then((r) => r.json());
const vaultAbi = await fetch("/docs/abis/basket-vault.json").then((r) => r.json());`}</code>
            </pre>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Operation</th>
                    <th>Contract call</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Discover baskets</td>
                    <td>
                      Index <code>BasketFactory.BasketDeployed</code>, or read <code>deployedCount()</code> and{" "}
                      <code>deployed(i)</code>.
                    </td>
                  </tr>
                  <tr>
                    <td>Validate an address</td>
                    <td>
                      <code>BasketFactory.isBasket(vault)</code>
                    </td>
                  </tr>
                  <tr>
                    <td>List tradable stocks</td>
                    <td>
                      <code>BasketLens.getAssets()</code> returns each stock with its oracle price and <code>updatedAt</code>.
                    </td>
                  </tr>
                  <tr>
                    <td>Read a basket</td>
                    <td>
                      <code>BasketLens.getBasket(vault)</code> returns supply, fees, NAV, TVL, and legs with weights. Page with{" "}
                      <code>getBaskets(offset, limit)</code>.
                    </td>
                  </tr>
                  <tr>
                    <td>Read composition</td>
                    <td>
                      Call <code>constituents()</code>, then <code>backing(token)</code> for the reserved balance.
                    </td>
                  </tr>
                  <tr>
                    <td>Read vault fees</td>
                    <td>
                      Call <code>mintFeeBps()</code>, <code>redeemFeeBps()</code>, and the <code>PROTOCOL_MINT_FEE_BPS</code> /{" "}
                      <code>PROTOCOL_REDEEM_FEE_BPS</code> constants.
                    </td>
                  </tr>
                  <tr>
                    <td>Preview direct flows</td>
                    <td>
                      Call <code>previewMint(shares)</code> or <code>previewRedeem(shares)</code> on the vault.
                    </td>
                  </tr>
                  <tr>
                    <td>Quote a trade</td>
                    <td>
                      Call <code>quoteBuy</code>, <code>quoteBuyExact</code>, or <code>quoteSell</code> on the router.
                    </td>
                  </tr>
                  <tr>
                    <td>Submit a trade</td>
                    <td>
                      Send the basket address to <code>BasketRouter</code>, with a limit and deadline.
                    </td>
                  </tr>
                  <tr>
                    <td>Read holdings</td>
                    <td>
                      <code>BasketLens.getHoldings(user)</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div className={styles.note}>
              <b>Units and decimals.</b> Stock tokens and basket shares use 18 decimals; USDC uses 6. Oracle prices are USD per
              <code> 1e18</code> token units, scaled to 18 decimals, and the lens reports NAV and TVL on the same 18-decimal
              USD scale. Router amounts are in USDC units.
            </div>
          </section>

          <section id="events" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Indexing</h2>
              <p>
                {ADDRESSES.startBlock
                  ? `Start at factory block ${Number(ADDRESSES.startBlock).toLocaleString("en-US")} and backfill in small ranges.`
                  : "Start at the factory deployment block and backfill in small ranges."}{" "}
                Wide log requests can time out on the public RPC.
              </p>
            </header>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Contract</th>
                    <th>Events</th>
                    <th>Indexed state</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>BasketFactory</td>
                    <td>
                      <code>AssetAdded, BasketDeployed</code>
                    </td>
                    <td>Stock allowlist, canonical vaults, creator, and deployment order</td>
                  </tr>
                  <tr>
                    <td>BasketVault</td>
                    <td>
                      <code>Minted, Redeemed, Transfer</code>
                    </td>
                    <td>Share activity and holder balances</td>
                  </tr>
                  <tr>
                    <td>BasketVault</td>
                    <td>
                      <code>FeesSet, OwnershipTransferred</code>
                    </td>
                    <td>Current configuration</td>
                  </tr>
                  <tr>
                    <td>BasketVault</td>
                    <td>
                      <code>TreasuryWithdrawn, ProtocolFeesSwept</code>
                    </td>
                    <td>Owner withdrawals and protocol-fee settlement by constituent</td>
                  </tr>
                  <tr>
                    <td>BasketRouter</td>
                    <td>
                      <code>Bought, Sold</code>
                    </td>
                    <td>Routed volume in shares and USDC</td>
                  </tr>
                  <tr>
                    <td>StockMarket</td>
                    <td>
                      <code>StockListed, SpreadSet, Bought, Sold</code>
                    </td>
                    <td>Listed stocks, spread, and per-stock flow</td>
                  </tr>
                  <tr>
                    <td>PriceOracle</td>
                    <td>
                      <code>PriceUpdated, KeeperSet</code>
                    </td>
                    <td>Price history and the keeper set</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={styles.afterTable}>
              Events provide historical state transitions. Live NAV and quotes require current contract reads, since they
              depend on the latest oracle prices.
            </p>
          </section>

          <section id="roles" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Permissions</h2>
              <p>
                Administrative roles can change fees and listings. They cannot withdraw holder backing or block redemption
                through the vault.
              </p>
            </header>
            <div className={styles.tableWrap}>
              <table>
                <thead>
                  <tr>
                    <th>Actor</th>
                    <th>Authorized operations</th>
                    <th>Restrictions</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>Basket owner</td>
                    <td>Set owner fees, withdraw owner treasury, transfer ownership</td>
                    <td>Change units, withdraw backing, pause, or block redemption</td>
                  </tr>
                  <tr>
                    <td>Factory owner</td>
                    <td>Allowlist new stocks, set the protocol fee recipient</td>
                    <td>Remove assets or touch deployed vaults</td>
                  </tr>
                  <tr>
                    <td>Market owner</td>
                    <td>List stocks, set the spread, withdraw the USDC reserve</td>
                    <td>Raise the spread above 100 bps or move vault backing</td>
                  </tr>
                  <tr>
                    <td>Oracle owner and keepers</td>
                    <td>The owner manages keepers; keepers publish prices</td>
                    <td>Publish a zero price</td>
                  </tr>
                  <tr>
                    <td>Anyone</td>
                    <td>Deploy baskets from allowlisted stocks, mint, redeem, trade, sweep protocol fees, claim the USDC faucet</td>
                    <td>Redirect protocol fees away from the fee recipient</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p className={styles.afterTable}>
              A vault&apos;s only mutable parameters are the two owner fees and the owner address. Units, constituents, and the
              protocol fees are fixed at deployment.
            </p>
          </section>

          <section id="risks" className={styles.docSection}>
            <header className={styles.sectionHeading}>
              <h2>Risks</h2>
              <p>Darwin is a testnet deployment. Market, oracle, issuer, and operational risk remain.</p>
            </header>
            <ul className={styles.riskList}>
              <li>
                <b>Asset exposure.</b> Stock tokens are testnet tokens priced by an oracle. They provide no share ownership,
                voting rights, or dividends.
              </li>
              <li>
                <b>Oracle.</b> NAV and router quotes are only as fresh and accurate as the last keeper update. There is no
                onchain staleness or deviation check.
              </li>
              <li>
                <b>Issuer control.</b> The stock market mints and burns every stock token. Its owner can change the spread and
                withdraw the USDC reserve that pays routed sells.
              </li>
              <li>
                <b>Liquidity.</b> Routed sells pay out from the market&apos;s USDC reserve. If it runs short, exit through the
                vault and receive the stock tokens in kind.
              </li>
              <li>
                <b>Execution.</b> Quotes are estimates. Always set deadlines and minimum-output or maximum-input bounds.
              </li>
              <li>
                <b>Operational dependencies.</b> Interfaces, RPCs, wallets, and the price keeper can be delayed or unavailable.
                Verify critical state onchain.
              </li>
            </ul>
            <div className={styles.reviewStatus}>
              <span>Review status</span>
              <p>The contracts have not been audited. Use them on testnet only.</p>
            </div>
          </section>
        </article>
        <aside className={styles.rightRail} aria-label="Documentation shortcuts">
          <div>
            <span>On this page</span>
            <nav>
              <a href="#transactions">Transaction methods</a>
              <a href="#fee-settlement">Fee calculation</a>
              <a href="#contracts">Contract reference</a>
              <a href="#integration">Integration workflow</a>
              <a href="#events">Indexing</a>
            </nav>
          </div>
          <div>
            <span>Resources</span>
            <nav>
              <a href="/docs/abis" target="_blank">
                ABI manifest <b aria-hidden="true">↗</b>
              </a>
              <a href={NETWORK.explorer} target="_blank" rel="noreferrer">
                Explorer <b aria-hidden="true">↗</b>
              </a>
            </nav>
          </div>
          <div className={styles.railStatus}>
            <span>Network</span>
            <b>{NETWORK.name}</b>
            <code>Chain ID {NETWORK.chainId}</code>
          </div>
        </aside>
      </div>
    </main>
  );
}
