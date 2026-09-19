"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Segmented } from "@/components/ui/Segmented";
import { StockLogo } from "@/components/ui/StockLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { assetColor } from "@/lib/assetColor";
import { useDarwin, MON_USD } from "@/lib/data/store";
import type { Basket } from "@/lib/data/types";
import { compactNumber, pct, qty, short, usd } from "@/lib/format";
import { chain, useWallet } from "@/lib/wallet";
import { maxInputAmount, pruneDecimalInput } from "./amount";
import { Status } from "@/components/ui/Status";
import styles from "./TradePanel.module.css";

export type TradeMode = "Buy" | "Sell" | "Deposit" | "Redeem";

export const TRADE_MODES: readonly TradeMode[] = ["Buy", "Sell", "Deposit", "Redeem"];

const SLIPPAGES = [0.005, 0.01, 0.03];

/** Units of each constituent the demo wallet can deposit. */
const DEMO_LEG_BALANCE = 1e6;

/** Simulated confirmation time for demo transactions. */
const DEMO_TX_MS = 900;

const compactQty = (n: number) => (n >= 1e5 ? compactNumber(n) : qty(n));

const addressUrl = (address: string) => `${chain.blockExplorers.default.url}/address/${address}`;

const PAST_TENSE: Record<TradeMode, string> = {
  Buy: "Purchase",
  Sell: "Sale",
  Deposit: "Deposit",
  Redeem: "Redemption",
};

const PROGRESS: Record<TradeMode, string> = {
  Buy: "Buying…",
  Sell: "Selling…",
  Deposit: "Minting…",
  Redeem: "Redeeming…",
};

export function TradePanel({
  b,
  onDone,
  only,
  compact,
  embedded,
  initialMode,
}: {
  b: Basket;
  onDone?: () => void;
  only?: readonly TradeMode[];
  compact?: boolean;
  embedded?: boolean;
  initialMode?: TradeMode;
}) {
  const wallet = useWallet();
  const { balanceOf, transact } = useDarwin();
  const isConnected = wallet.isConnected && !!wallet.address;

  const isMon = b.quote === "MON";
  const quoteSymbol = isMon ? "MON" : "USDC";
  const quoteUsd = isMon ? MON_USD : 1;

  const modes = useMemo(() => only ?? TRADE_MODES, [only]);
  const [mode, setMode] = useState<TradeMode>(() => (initialMode && modes.includes(initialMode) ? initialMode : (modes[0] ?? "Redeem")));
  const [input, setInput] = useState("1");
  const [slippage, setSlippage] = useState(0.01);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const amount = Number(input) || 0;
  const minting = mode === "Buy" || mode === "Deposit";
  const swapping = mode === "Buy" || mode === "Sell";
  const feeBps = minting ? b.mintFeeBps + b.protocolMintFeeBps : b.redeemFeeBps + b.protocolRedeemFeeBps;

  // Local quote: pool price per share (cost vs NAV premium), fees, and size impact against 1% capacity.
  const premium = b.navUsd > 0 && b.costPerShareUsd > 0 ? b.costPerShareUsd / b.navUsd : 1;
  const impact = (usdSize: number) => (b.capacityUsd > 0 ? (0.01 * usdSize) / b.capacityUsd : 0);
  const fairShares = mode === "Buy" && b.navUsd > 0 ? (amount * quoteUsd) / b.navUsd : 0;
  const buyShares =
    mode === "Buy" && b.navUsd > 0 && amount > 0
      ? (amount * quoteUsd) / (b.navUsd * premium * (1 + feeBps / 1e4) * (1 + impact(amount * quoteUsd)))
      : 0;
  const sellQuote =
    mode === "Sell" && amount > 0 && quoteUsd > 0
      ? (amount * b.navUsd * (1 - feeBps / 1e4) * (1 - impact(amount * b.navUsd))) / premium / quoteUsd
      : 0;
  const hasQuote = mode === "Buy" ? buyShares > 0 : mode === "Sell" ? sellQuote > 0 : false;
  const buyPremium = mode === "Buy" && hasQuote && fairShares > 0 ? 1 - buyShares / fairShares : null;
  const sellDiscount =
    mode === "Sell" && hasQuote && amount > 0 && b.navUsd > 0 ? 1 - (sellQuote * quoteUsd) / (amount * b.navUsd) : null;

  const shareBalance = isConnected ? balanceOf(wallet.address, b.address) : null;
  const legBalances = useMemo(() => (isConnected ? b.legs.map(() => DEMO_LEG_BALANCE) : null), [isConnected, b.legs]);
  const shares = mode === "Buy" ? buyShares : amount;
  const hourlyCap = minting ? b.issuanceAvailable : b.redemptionAvailable;

  const depositCover =
    mode === "Deposit" && legBalances
      ? b.legs.reduce((min, leg, i) => {
          const need = leg.perShare * (1 + feeBps / 1e4);
          return need <= 0 ? min : Math.min(min, (legBalances[i] ?? 0) / need);
        }, Infinity)
      : null;
  const depositMax = depositCover !== null && Number.isFinite(depositCover) ? Math.max(0, depositCover) : null;
  const mintable = depositMax === null ? null : Math.min(depositMax, hourlyCap ?? Infinity);
  const available = mode === "Deposit" ? mintable : mode === "Sell" || mode === "Redeem" ? shareBalance : null;

  const overHourly = hourlyCap !== undefined && shares > hourlyCap + 1e-9;
  const paused = b.paused && minting;
  const overCapacity = mode === "Buy" && b.capacityUsd > 0 && amount * quoteUsd > b.capacityUsd;
  const overBalance = !minting && shareBalance !== null && amount > shareBalance;
  const overWallet = mode === "Deposit" && depositMax !== null && amount > depositMax + 1e-9;

  const blocker = isConnected
    ? paused
      ? "Issuance is paused"
      : overHourly
        ? `Only ${qty(hourlyCap)} shares can ${minting ? "be minted" : "exit"} this hour`
        : overCapacity
          ? `Above the ${usd(b.capacityUsd)} 1% capacity`
          : overWallet
            ? `Wallet assets cover up to ${qty(depositMax ?? 0)} shares`
            : overBalance
              ? `Above your ${qty(shareBalance ?? 0)} share balance`
              : amount <= 0
                ? "Enter an amount"
                : null
    : "Connect wallet";

  function confirm() {
    if (!isConnected || !wallet.address || amount <= 0 || blocker) return;
    const account = wallet.address;
    setWorking(true);
    setStatus(PROGRESS[mode]);
    timer.current = setTimeout(() => {
      transact(account, b.address, minting ? shares : -amount);
      setStatus(`${PAST_TENSE[mode]} recorded.`);
      setWorking(false);
      setReviewing(false);
      onDone?.();
    }, DEMO_TX_MS);
  }

  const payLabel = mode === "Buy" ? "You pay" : "Shares to sell";

  const payWell = (
    <>
      <div className="well-head">
        <span>{payLabel}</span>
        {available !== null && (
          <span>
            Available {compactQty(available)} ·{" "}
            <button
              className="max-btn"
              disabled={available <= 0}
              onClick={() => {
                setInput(maxInputAmount(available));
                setReviewing(false);
              }}
            >
              Max
            </button>
          </span>
        )}
      </div>
      <div className="well-body">
        <input
          className="bare well-amount num"
          value={input}
          inputMode="decimal"
          onChange={(event) => {
            setInput(pruneDecimalInput(event.target.value));
            setReviewing(false);
          }}
          aria-label={mode === "Buy" ? `Amount of ${quoteSymbol} to pay` : `Shares of ${b.symbol} to sell`}
        />
        <span className="unit">
          {mode === "Buy" && <i data-quote={quoteSymbol} />}
          {mode === "Buy" ? quoteSymbol : b.symbol}
        </span>
      </div>
      <div className="well-note num">{mode === "Buy" ? `≈ ${usd(amount * quoteUsd)}` : `Current value ${usd(amount * b.navUsd)}`}</div>
    </>
  );

  const receiveWell =
    mode === "Buy" ? (
      <>
        <div className="well-head">
          <span>You receive</span>
          <Tooltip term="estimatedOutput" align="right" side="bottom" />
        </div>
        <div className="well-body">
          <span className="well-amount num">{buyShares > 0 ? qty(buyShares) : "—"}</span>
          <span className="unit">{b.symbol}</span>
        </div>
        <div className="well-note">
          {buyPremium !== null ? `${pct(buyPremium)} above NAV · fees + impact included` : hasQuote ? "Pool quote" : "Quote pending"}
        </div>
      </>
    ) : (
      <>
        <div className="well-head">
          <span>You receive</span>
          <Tooltip term="estimatedOutput" align="right" side="bottom" />
        </div>
        <div className="well-body">
          <span className="well-amount num">{sellQuote > 0 ? qty(sellQuote) : "—"}</span>
          <span className="unit">
            <i data-quote={quoteSymbol} />
            {quoteSymbol}
          </span>
        </div>
        <div className="well-note">
          {sellDiscount !== null ? `${pct(sellDiscount)} below NAV · fees + impact included` : hasQuote ? "Pool quote" : "Quote pending"}
        </div>
      </>
    );

  const inKindAssets = useMemo(
    () =>
      swapping
        ? []
        : b.legs.map((leg, i) => ({
            address: leg.address,
            symbol: leg.symbol,
            weight: leg.weight,
            amount: amount * leg.perShare * (minting ? 1 + feeBps / 1e4 : 1 - feeBps / 1e4),
            available: legBalances ? (legBalances[i] ?? 0) : null,
          })),
    [amount, b.legs, feeBps, legBalances, minting, swapping],
  );
  const shownAssets = inKindAssets.slice(0, embedded ? 4 : 6);
  const hiddenAssets = inKindAssets.length - shownAssets.length;
  const costImpact = mode === "Buy" ? buyPremium : mode === "Sell" ? sellDiscount : null;

  return (
    <>
      <div className={embedded ? styles.embedded : "card"} data-details-open={detailsOpen || undefined} data-trade-mode={mode.toLowerCase()}>
        <div className={styles.modeNav} aria-hidden={detailsOpen}>
          <Segmented
            options={modes}
            value={mode}
            onChange={(next) => {
              setMode(next);
              setReviewing(false);
              setDetailsOpen(false);
            }}
            label="Trade mode"
            fill
            optionTone={(m) => m.toLowerCase()}
            disabled={() => detailsOpen}
          />
        </div>
        <div key={mode} className={styles.modeBody}>
          {swapping ? (
            <>
              <div className="well" style={{ marginTop: 16 }}>
                {payWell}
              </div>
              <div className="swap-arrow">
                <span aria-hidden>↓</span>
              </div>
              <div className="well">{receiveWell}</div>
            </>
          ) : (
            <div className={styles.inKindPanel} data-tone={mode.toLowerCase()}>
              <div className={styles.shareInputSection}>
                <div className={styles.shareInputHead}>
                  <span>{mode === "Deposit" ? "Shares to mint" : "Shares to redeem"}</span>
                  {available !== null && (
                    <span className={styles.available}>
                      {mode === "Deposit" ? "Can mint" : "Available"} <b className="num">{compactQty(available)}</b>
                      <button
                        className={styles.useMax}
                        disabled={available <= 0}
                        onClick={() => {
                          setInput(maxInputAmount(available));
                          setReviewing(false);
                        }}
                      >
                        Use max
                      </button>
                    </span>
                  )}
                </div>
                <div className={styles.shareInputRow}>
                  <input
                    className={`bare num ${styles.shareInput}`}
                    value={input}
                    inputMode="decimal"
                    onChange={(event) => {
                      setInput(pruneDecimalInput(event.target.value));
                      setReviewing(false);
                    }}
                    aria-label={`${mode === "Deposit" ? "Shares to mint" : "Shares to redeem"} in ${b.symbol}`}
                  />
                  <span className={styles.shareSymbol}>{b.symbol}</span>
                </div>
                <div className={styles.currentValue}>
                  Current value <span className="num">{usd(amount * b.navUsd)}</span>
                </div>
              </div>
              <div className={styles.assetSection}>
                <div className={styles.assetSectionHead}>
                  <strong className="label-row">
                    {mode === "Deposit" ? "From your wallet" : "To your wallet"}
                    <Tooltip term={mode === "Deposit" ? "depositAssets" : "redeemAssets"} align="left" side="bottom" />
                  </strong>
                </div>
                <div className={styles.assetWeightBar} aria-hidden>
                  {inKindAssets.map((asset) => (
                    <i key={asset.address} style={{ flexGrow: Math.max(asset.weight, 0.001), background: assetColor(asset.symbol) }} />
                  ))}
                </div>
                <div className={styles.assetRows}>
                  {shownAssets.map((asset) => {
                    const isShort = mode === "Deposit" && asset.available !== null && asset.available < asset.amount;
                    return (
                      <div key={asset.address} className={styles.assetRow} data-short={isShort || undefined}>
                        <StockLogo sym={asset.symbol} size={22} />
                        <span>{asset.symbol}</span>
                        <b className="num">{embedded ? compactQty(asset.amount) : qty(asset.amount)}</b>
                      </div>
                    );
                  })}
                </div>
                {hiddenAssets > 0 && (
                  <button className={styles.moreAssets} onClick={() => setDetailsOpen(true)}>
                    {hiddenAssets} more {hiddenAssets === 1 ? "asset" : "assets"} in Details
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
        <div className={styles.capacitySlot}>
          {swapping && b.capacityUsd > 0 && (
            <div className="tline">
              <span className="c-muted label-row">
                1% capacity
                <Tooltip term="onePercentCapacity" align="left" />
              </span>
              <b className="num">{usd(b.capacityUsd)}</b>
            </div>
          )}
        </div>
        <div className={styles.detailsSlot}>
          <details className={styles.details} open={detailsOpen} onToggle={(event) => setDetailsOpen(event.currentTarget.open)}>
            <summary>Details</summary>
            {detailsOpen && (
              <>
                <div className="tlines">
                  {swapping ? (
                    <div className="tline">
                      <span className="label-row">
                        Max slippage
                        <Tooltip term="maxSlippage" align="left" />
                      </span>
                      <span className="slips">
                        {SLIPPAGES.map((s) => (
                          <button key={s} data-on={slippage === s || undefined} onClick={() => setSlippage(s)}>
                            {(100 * s).toFixed(+(s < 0.01))}%
                          </button>
                        ))}
                      </span>
                    </div>
                  ) : (
                    <div className="tline">
                      <span className="label-row">
                        {mode === "Deposit" ? "Mint fee" : "Redemption fee"}
                        <Tooltip term={minting ? "mintFee" : "redemptionFee"} align="left" />
                      </span>
                      <span className="num">{pct(feeBps / 1e4)}</span>
                    </div>
                  )}
                  {hourlyCap !== undefined && (
                    <div className="tline">
                      <span className="label-row">
                        {minting ? "Mintable this hour" : "Redeemable this hour"}
                        <Tooltip term={minting ? "mintCapacity" : "redemptionCapacity"} align="left" />
                      </span>
                      <span className={`num ${overHourly ? "c-warning" : ""}`}>
                        {qty(hourlyCap)} {b.symbol}
                      </span>
                    </div>
                  )}
                  <div className="tline">
                    <span>Network</span>
                    <span>{chain.name}</span>
                  </div>
                </div>
                {!swapping && (
                  <details className="trade-assets">
                    <summary>
                      <span>{mode === "Deposit" ? "Assets required" : "Assets returned"}</span>
                    </summary>
                    <div className="trade-assets-list">
                      {b.legs.map((leg, i) => {
                        const need = amount * leg.perShare * (minting ? 1 + feeBps / 1e4 : 1 - feeBps / 1e4);
                        const have = legBalances ? (legBalances[i] ?? 0) : null;
                        const isShort = minting && have !== null && have < need;
                        return (
                          <div key={leg.address}>
                            <StockLogo sym={leg.symbol} size={20} />
                            <span style={{ fontWeight: 600, flex: 1 }}>{leg.symbol}</span>
                            <span className={`num ${isShort ? "c-negative" : ""}`}>{qty(need)}</span>
                            {isShort && have !== null && (
                              <span className="num c-negative" style={{ fontSize: 10.5 }}>
                                short {qty(need - have)}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </details>
                )}
              </>
            )}
          </details>
        </div>
        {reviewing ? (
          <div className={styles.review}>
            <div className={styles.reviewTitle}>Review {mode.toLowerCase()}</div>
            <div className={styles.reviewRows}>
              {mode === "Deposit" || mode === "Redeem" ? (
                <>
                  <div>
                    <span>{mode === "Deposit" ? "Shares minted" : "Shares redeemed"}</span>
                    <b className="num">
                      {input} {b.symbol}
                    </b>
                  </div>
                  <div className={styles.reviewAssetRow}>
                    <span>{mode === "Deposit" ? "From wallet" : "To wallet"}</span>
                    <b>
                      {inKindAssets.map((asset) => (
                        <i key={asset.address}>
                          <span>{asset.symbol}</span> <span className="num">{qty(asset.amount)}</span>
                        </i>
                      ))}
                    </b>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <span>Pay</span>
                    <b className="num">
                      {input} {mode === "Buy" ? quoteSymbol : b.symbol}
                    </b>
                  </div>
                  <div>
                    <span>Receive</span>
                    <b className="num">{mode === "Buy" ? `${qty(buyShares)} ${b.symbol}` : `${qty(sellQuote)} ${quoteSymbol}`}</b>
                  </div>
                </>
              )}
              <div>
                <span>{swapping ? "Fees + impact" : mode === "Deposit" ? "Mint fee" : "Redemption fee"}</span>
                <b className="num">{swapping ? (costImpact === null ? "Pending" : pct(costImpact)) : pct(feeBps / 1e4)}</b>
              </div>
              {swapping && (
                <div>
                  <span>Max slippage</span>
                  <b className="num">{pct(slippage)}</b>
                </div>
              )}
              <div>
                <span>Basket contract</span>
                <a className="mono" href={addressUrl(b.address)} target="_blank" rel="noreferrer" title={b.address}>
                  {short(b.address)}
                </a>
              </div>
              <div>
                <span>Network</span>
                <b>{chain.name}</b>
              </div>
            </div>
            <div className={styles.reviewActions}>
              <button className={`btn ${styles.modeAction}`} data-tone={mode.toLowerCase()} disabled={working} onClick={confirm}>
                {working ? "Working…" : "Confirm"}
              </button>
              <button className="btn btn-line" disabled={working} onClick={() => setReviewing(false)}>
                Edit
              </button>
            </div>
          </div>
        ) : (
          <button
            className={`btn btn-cta ${styles.modeAction}`}
            data-tone={mode.toLowerCase()}
            style={{ marginTop: 16 }}
            disabled={working || (isConnected ? !!blocker : wallet.connecting)}
            onClick={() => {
              if (isConnected) {
                setDetailsOpen(false);
                setReviewing(true);
              } else wallet.connect();
            }}
          >
            {blocker ?? `Review ${mode.toLowerCase()}`}
          </button>
        )}
        <Status text={status} />
      </div>
      {!compact && (
        <div className="card kv-card">
          <div>
            <span>Your balance</span>
            <b className="num">{shareBalance === null ? "—" : `${qty(shareBalance)} ${b.symbol}`}</b>
          </div>
          <div>
            <span>Your share of supply</span>
            <b className="num">{shareBalance === null || b.supplyFloat <= 0 ? "—" : pct(shareBalance / b.supplyFloat)}</b>
          </div>
          {b.costPerShareUsd > 0 && (
            <div>
              <span className="label-row">
                Cost vs worth
                <Tooltip term="costVsWorth" align="left" />
              </span>
              <b className="num">
                {usd(b.costPerShareUsd)} / {usd(b.navUsd)}
              </b>
            </div>
          )}
        </div>
      )}
    </>
  );
}
