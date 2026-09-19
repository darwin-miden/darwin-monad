"use client";

import { useMemo, useState } from "react";
import { maxUint256 } from "viem";
import { usePublicClient, useReadContract, useReadContracts } from "wagmi";
import { Segmented } from "@/components/ui/Segmented";
import { StockLogo } from "@/components/ui/StockLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { FaucetButton } from "@/components/wallet/FaucetButton";
import { assetColor } from "@/lib/assetColor";
import {
  DEPLOYMENT,
  chainDeadline,
  erc20Abi,
  fromUsdc,
  fromWad,
  parseAmount,
  routerAbi,
  USDC_DECIMALS,
  vaultAbi,
  withSlippage,
} from "@/lib/contracts";
import { useDarwin } from "@/lib/data/store";
import type { Basket } from "@/lib/data/types";
import { compactNumber, pct, qty, short, usd } from "@/lib/format";
import { errorMessage, txUrl, useSendTx } from "@/lib/tx";
import { chain, useWallet } from "@/lib/wallet";
import { maxInputAmount, pruneDecimalInput } from "./amount";
import { Status } from "@/components/ui/Status";
import styles from "./TradePanel.module.css";

export type TradeMode = "Buy" | "Sell" | "Deposit" | "Redeem";

export const TRADE_MODES: readonly TradeMode[] = ["Buy", "Sell", "Deposit", "Redeem"];

const SLIPPAGES = [0.005, 0.01, 0.03];

/** BasketVault.MIN_MINT_SHARES */
const MIN_MINT_SHARES = 0.001;

const REFRESH_MS = 8_000;

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
  const { refresh } = useDarwin();
  const sendTx = useSendTx();
  const client = usePublicClient({ chainId: chain.id });
  const account = wallet.address;
  const isConnected = wallet.isConnected && !!account;
  const vault = b.address as `0x${string}`;

  const quoteSymbol = "USDC";

  const modes = useMemo(() => only ?? TRADE_MODES, [only]);
  const [mode, setMode] = useState<TradeMode>(() => (initialMode && modes.includes(initialMode) ? initialMode : (modes[0] ?? "Redeem")));
  const [input, setInput] = useState("100");
  const [slippage, setSlippage] = useState(0.01);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const amount = Number(input) || 0;
  const minting = mode === "Buy" || mode === "Deposit";
  const swapping = mode === "Buy" || mode === "Sell";
  const feeBps = minting ? b.mintFeeBps + b.protocolMintFeeBps : b.redeemFeeBps + b.protocolRedeemFeeBps;
  const usdIn = mode === "Buy" ? parseAmount(input, USDC_DECIMALS) : 0n;
  const sharesIn = mode === "Buy" ? 0n : parseAmount(input, 18);

  // Wallet state: USDC, basket shares, every constituent, and the allowances each flow needs.
  const { data: walletReads } = useReadContracts({
    allowFailure: false,
    contracts: account
      ? [
          { address: DEPLOYMENT.usd, abi: erc20Abi, functionName: "balanceOf", args: [account] },
          { address: DEPLOYMENT.usd, abi: erc20Abi, functionName: "allowance", args: [account, DEPLOYMENT.router] },
          { address: vault, abi: erc20Abi, functionName: "balanceOf", args: [account] },
          { address: vault, abi: erc20Abi, functionName: "allowance", args: [account, DEPLOYMENT.router] },
          ...b.legs.map((l) => ({ address: l.address as `0x${string}`, abi: erc20Abi, functionName: "balanceOf" as const, args: [account] as const })),
          ...b.legs.map((l) => ({
            address: l.address as `0x${string}`,
            abi: erc20Abi,
            functionName: "allowance" as const,
            args: [account, vault] as const,
          })),
        ]
      : [],
    query: { enabled: isConnected, refetchInterval: REFRESH_MS },
  });
  const reads = walletReads as bigint[] | undefined;
  const usdcBalance = reads?.[0];
  const usdcAllowance = reads?.[1] ?? 0n;
  const shareBalanceRaw = reads?.[2];
  const shareAllowance = reads?.[3] ?? 0n;
  const legBalancesRaw = reads?.slice(4, 4 + b.legs.length);
  const legAllowances = reads?.slice(4 + b.legs.length) ?? [];

  // Exact quotes from the router and vault.
  const { data: buyQuote } = useReadContract({
    address: DEPLOYMENT.router,
    abi: routerAbi,
    functionName: "quoteBuy",
    args: [vault, usdIn],
    query: { enabled: mode === "Buy" && usdIn > 0n, refetchInterval: REFRESH_MS },
  });
  const { data: sellQuoteRaw } = useReadContract({
    address: DEPLOYMENT.router,
    abi: routerAbi,
    functionName: "quoteSell",
    args: [vault, sharesIn],
    query: { enabled: mode === "Sell" && sharesIn > 0n, refetchInterval: REFRESH_MS },
  });
  const { data: mintAmounts } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "previewMint",
    args: [sharesIn],
    query: { enabled: mode === "Deposit" && sharesIn > 0n },
  });
  const { data: redeemAmounts } = useReadContract({
    address: vault,
    abi: vaultAbi,
    functionName: "previewRedeem",
    args: [sharesIn],
    query: { enabled: mode === "Redeem" && sharesIn > 0n },
  });

  const fairShares = mode === "Buy" && b.navUsd > 0 ? amount / b.navUsd : 0;
  const buyShares = mode === "Buy" && usdIn > 0n ? fromWad(buyQuote) : 0;
  const sellQuote = mode === "Sell" && sharesIn > 0n ? fromUsdc(sellQuoteRaw) : 0;
  const hasQuote = mode === "Buy" ? buyShares > 0 : mode === "Sell" ? sellQuote > 0 : false;
  const buyPremium = mode === "Buy" && hasQuote && fairShares > 0 ? 1 - buyShares / fairShares : null;
  const sellDiscount =
    mode === "Sell" && hasQuote && amount > 0 && b.navUsd > 0 ? 1 - sellQuote / (amount * b.navUsd) : null;

  const usdcFloat = isConnected && usdcBalance !== undefined ? fromUsdc(usdcBalance) : null;
  const shareBalance = isConnected && shareBalanceRaw !== undefined ? fromWad(shareBalanceRaw) : null;
  const legBalances = useMemo(() => (isConnected && legBalancesRaw ? legBalancesRaw.map(fromWad) : null), [isConnected, legBalancesRaw]);
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
  const available =
    mode === "Buy" ? usdcFloat : mode === "Deposit" ? mintable : mode === "Sell" || mode === "Redeem" ? shareBalance : null;

  const overHourly = hourlyCap !== undefined && shares > hourlyCap + 1e-9;
  const paused = b.paused && minting;
  const overCapacity = mode === "Sell" && b.capacityUsd > 0 && sellQuote > b.capacityUsd;
  const overBalance = !minting && shareBalance !== null && sharesIn > (shareBalanceRaw ?? 0n);
  const overUsdc = mode === "Buy" && usdcBalance !== undefined && usdIn > usdcBalance;
  const overWallet =
    mode === "Deposit" &&
    !!mintAmounts &&
    !!legBalancesRaw &&
    mintAmounts.some((need, i) => need > (legBalancesRaw[i] ?? 0n));
  const belowMinimum = minting && shares > 0 && shares < MIN_MINT_SHARES;

  const blocker = isConnected
    ? paused
      ? "Issuance is paused"
      : amount <= 0
        ? "Enter an amount"
        : overUsdc
          ? "Insufficient USDC"
          : overHourly
            ? `Only ${qty(hourlyCap)} shares can ${minting ? "be minted" : "exit"} this hour`
            : overBalance
              ? `Above your ${qty(shareBalance ?? 0)} share balance`
              : overWallet
                ? depositMax
                  ? `Wallet assets cover up to ${qty(depositMax)} shares`
                  : `You don't hold the ${b.symbol} constituents`
                : overCapacity
                  ? `Above the ${usd(b.capacityUsd)} market reserve`
                  : belowMinimum
                    ? `Minimum ${MIN_MINT_SHARES} shares`
                    : mode === "Buy" && !hasQuote
                      ? "Fetching quote…"
                      : null
    : wallet.hasWallet
      ? "Connect wallet"
      : "Install a wallet";

  async function confirm() {
    if (!isConnected || !account || !client || blocker) return;
    setWorking(true);
    try {
      let hash: string;
      if (mode === "Buy") {
        if (usdcAllowance < usdIn) {
          setStatus("Approving USDC…");
          await sendTx({ address: DEPLOYMENT.usd, abi: erc20Abi, functionName: "approve", args: [DEPLOYMENT.router, maxUint256] });
        }
        setStatus(PROGRESS.Buy);
        const quoted = await client.readContract({ address: DEPLOYMENT.router, abi: routerAbi, functionName: "quoteBuy", args: [vault, usdIn] });
        ({ hash } = await sendTx({
          address: DEPLOYMENT.router,
          abi: routerAbi,
          functionName: "buy",
          args: [vault, usdIn, withSlippage(quoted, slippage), account, await chainDeadline(client)],
        }));
      } else if (mode === "Sell") {
        if (shareAllowance < sharesIn) {
          setStatus(`Approving ${b.symbol}…`);
          await sendTx({ address: vault, abi: erc20Abi, functionName: "approve", args: [DEPLOYMENT.router, maxUint256] });
        }
        setStatus(PROGRESS.Sell);
        const quoted = await client.readContract({ address: DEPLOYMENT.router, abi: routerAbi, functionName: "quoteSell", args: [vault, sharesIn] });
        ({ hash } = await sendTx({
          address: DEPLOYMENT.router,
          abi: routerAbi,
          functionName: "sell",
          args: [vault, sharesIn, withSlippage(quoted, slippage), account, await chainDeadline(client)],
        }));
      } else if (mode === "Deposit") {
        const need = await client.readContract({ address: vault, abi: vaultAbi, functionName: "previewMint", args: [sharesIn] });
        const approvals = b.legs.filter((_, i) => (legAllowances[i] ?? 0n) < need[i]);
        for (const [n, leg] of approvals.entries()) {
          setStatus(`Approving ${leg.symbol} (${n + 1}/${approvals.length})…`);
          await sendTx({ address: leg.address as `0x${string}`, abi: erc20Abi, functionName: "approve", args: [vault, maxUint256] });
        }
        setStatus(PROGRESS.Deposit);
        ({ hash } = await sendTx({ address: vault, abi: vaultAbi, functionName: "mint", args: [sharesIn, account, need, await chainDeadline(client)] }));
      } else {
        setStatus(PROGRESS.Redeem);
        const out = await client.readContract({ address: vault, abi: vaultAbi, functionName: "previewRedeem", args: [sharesIn] });
        ({ hash } = await sendTx({ address: vault, abi: vaultAbi, functionName: "redeem", args: [sharesIn, account, out, await chainDeadline(client)] }));
      }
      setStatus(`${PAST_TENSE[mode]} confirmed. ${txUrl(hash)}`);
      setInput("");
      setReviewing(false);
      await refresh();
      onDone?.();
    } catch (e) {
      setStatus(errorMessage(e));
    } finally {
      setWorking(false);
    }
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
      <div className="well-note num">{mode === "Buy" ? `≈ ${usd(amount)}` : `Current value ${usd(amount * b.navUsd)}`}</div>
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
            amount:
              mode === "Deposit" && mintAmounts
                ? fromWad(mintAmounts[i])
                : mode === "Redeem" && redeemAmounts
                  ? fromWad(redeemAmounts[i])
                  : amount * leg.perShare * (minting ? 1 + feeBps / 1e4 : 1 - feeBps / 1e4),
            available: legBalances ? (legBalances[i] ?? 0) : null,
          })),
    [amount, b.legs, feeBps, legBalances, minting, swapping, mode, mintAmounts, redeemAmounts],
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
        {isConnected && mode === "Buy" && usdcFloat !== null && (usdcFloat < 100 || overUsdc) && (
          <div className={styles.faucetRow}>
            <FaucetButton />
          </div>
        )}
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
