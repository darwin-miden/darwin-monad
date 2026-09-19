"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, type CSSProperties } from "react";
import { useConnection } from "wagmi";
import { CompositionTreemap } from "@/components/treemap/CompositionTreemap";
import { SearchableMultiSelectDropdown } from "@/components/ui/Dropdown";
import { LogoStack, StockLogo } from "@/components/ui/StockLogo";
import { Tooltip } from "@/components/ui/Tooltip";
import { capacityUsd, useAssets, useDarwin } from "@/lib/data/store";
import type { Asset, Quote } from "@/lib/data/types";
import { pct, qty, short, usd } from "@/lib/format";
import { chain, useWallet } from "@/lib/wallet";
import { Status } from "@/components/ui/Status";
import styles from "./create.module.css";

const MAX_ASSETS = 16;
const QUOTES: readonly Quote[] = ["USDC", "MON"];
/** Router mint/redeem fee applied to new baskets (10 bps each way). */
const PROTOCOL_FEE = 0.001;

const DECIMAL_INPUT = /^\d*(?:\.\d*)?$/;

/** Keeps a decimal string typeable: digits, one dot, at most `digits` decimals. */
function pruneDecimalInput(value: string, digits = 4) {
  const cleaned = DECIMAL_INPUT.test(value) ? value : value.replace(/[^\d.]/g, "");
  const dot = cleaned.indexOf(".");
  if (dot < 0) return cleaned;
  return `${cleaned.slice(0, dot)}.${cleaned.slice(dot + 1).replaceAll(".", "").slice(0, digits)}`;
}

/**
 * Splits `total` percentage points across `ids` in proportion to their current shares,
 * keeping every asset at 1% or more.
 */
function redistribute(ids: string[], shares: Record<string, number>, total: number) {
  const out: Record<string, number> = {};
  let remaining = [...ids];
  let budget = total;
  while (remaining.length > 0) {
    const sum = remaining.reduce((s, id) => s + Math.max(0, shares[id] ?? 0), 0);
    const shareOf = (id: string) => (sum > 0 ? (budget * Math.max(0, shares[id] ?? 0)) / sum : budget / remaining.length);
    const floored = remaining.filter((id) => shareOf(id) < 1);
    if (floored.length === 0) {
      remaining.forEach((id) => {
        out[id] = shareOf(id);
      });
      break;
    }
    floored.forEach((id) => {
      out[id] = 1;
    });
    budget -= floored.length;
    const pinned = new Set(floored);
    remaining = remaining.filter((id) => !pinned.has(id));
  }
  return out;
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export function CreateBasket({ initialAsset }: { initialAsset?: string }) {
  const router = useRouter();
  const wallet = useWallet();
  const { chainId } = useConnection();
  const { createBasket } = useDarwin();
  const { data } = useAssets();

  const [quote, setQuote] = useState<Quote>("USDC");
  // `/create?asset=NVDA` (linked from stock pages) starts with that stock picked.
  const preset = data.assets.find((a) => a.symbol === initialAsset?.toUpperCase())?.address;
  const [selected, setSelected] = useState<string[]>(preset ? [preset] : []);
  const [focused, setFocused] = useState<string | null>(preset ?? null);
  const [shares, setShares] = useState<Record<string, number>>(preset ? { [preset]: 100 } : {});
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [navInput, setNavInput] = useState("100");
  const [step, setStep] = useState(0);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const connected = wallet.isConnected && Boolean(wallet.address);
  const wrongNetwork = connected && chainId !== undefined && chainId !== chain.id;

  const reachable = useMemo(() => [...data.assets].sort((a, b) => b.depthUsd - a.depthUsd), [data.assets]);
  const picked = useMemo(
    () => selected.map((address) => reachable.find((a) => a.address === address)).filter((a): a is Asset => Boolean(a)),
    [selected, reachable],
  );

  const options = useMemo(
    () =>
      reachable.map((asset) => ({
        value: asset.address,
        label: asset.symbol,
        description: asset.name,
        keywords: [asset.name],
        icon: <StockLogo sym={asset.symbol} size={22} />,
        disabled: selected.length >= MAX_ASSETS && !selected.includes(asset.address),
      })),
    [selected, reachable],
  );

  const nav = Number(navInput) || 0;

  const { legs, costs, costSum, capacity } = useMemo(() => {
    const total = picked.reduce((s, a) => s + (shares[a.address] ?? 1), 0) || 1;
    const legs = picked.map((asset) => {
      const weight = (shares[asset.address] ?? 1) / total;
      return {
        asset,
        weight,
        depthUsd: asset.depthUsd,
        price: asset.priceUsd,
        qtyPerShare: asset.priceUsd > 0 ? (nav * weight) / asset.priceUsd : 0,
      };
    });
    const costs = legs.map((l) => (l.depthUsd > 0 ? (l.weight * l.weight) / l.depthUsd : Infinity));
    return { legs, costs, costSum: costs.reduce((s, c) => s + c, 0) || 1, capacity: capacityUsd(legs) };
  }, [picked, nav, shares]);

  const priced = legs.every((l) => l.price > 0);
  const representable = legs.every((l) => Math.floor(l.qtyPerShare * 10 ** l.asset.decimals) > 0);
  const setupVisible = picked.length >= 2;
  const ready = picked.length >= 2 && Boolean(name.trim()) && Boolean(ticker.trim()) && nav > 0 && priced && representable;

  const onAssetsChange = (next: string[]) => {
    const kept = next.slice(0, MAX_ASSETS);
    const even = kept.length > 0 ? 100 / kept.length : 0;
    setSelected(kept);
    setShares(Object.fromEntries(kept.map((address) => [address, even])));
    setFocused((current) => (current && kept.includes(current) ? current : (kept[0] ?? null)));
  };

  const onDistribution = (value: number) => {
    if (!focused || picked.length < 2) return;
    const others = picked.filter((a) => a.address !== focused).map((a) => a.address);
    setShares({ [focused]: value, ...redistribute(others, shares, 100 - value) });
  };

  async function deploy() {
    if (!connected || !wallet.address) return setStatus("Connect a wallet first.");
    if (wrongNetwork) return setStatus(`Switch to ${chain.name}.`);
    if (!ready) return setStatus("Select at least two priced assets and name the basket.");
    setWorking(true);
    try {
      setStatus("Checking deployment…");
      await wait(450);
      setStatus("Confirm deployment…");
      await wait(650);
      const basket = createBasket({
        name: name.trim(),
        symbol: ticker.trim(),
        quote,
        navUsd: nav,
        owner: wallet.address,
        allocations: legs.map((l) => ({ symbol: l.asset.symbol, weight: l.weight })),
      });
      setStatus("Basket created.");
      router.push(`/basket/${basket.address}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error));
    } finally {
      setWorking(false);
    }
  }

  const tiles = legs.map((l) => ({ id: l.asset.address, symbol: l.asset.symbol, weight: l.weight }));
  const focusedLeg = legs.find((l) => l.asset.address === focused) ?? null;
  const focusedPct = focusedLeg ? Math.round(100 * focusedLeg.weight) : 0;
  const maxPct = Math.max(1, 100 - Math.max(1, legs.length - 1));
  const progress = Math.min(step + 1, 3) / 3;
  const canAdvance = step === 0 ? name.trim().length > 0 : step === 1 ? ticker.trim().length > 0 : step === 2 && nav > 0;

  const next = () => {
    if (canAdvance && step < 3) setStep(step + 1);
  };

  const confirmLabel = working
    ? "Working…"
    : picked.length < 2
      ? "Select at least 2 assets"
      : !priced
        ? "Pricing…"
        : !representable
          ? "Increase NAV price"
          : !connected
            ? "Connect wallet"
            : wrongNetwork
              ? "Wrong network"
              : "Confirm basket";

  return (
    <main className="page">
      <div className="wrap">
        <div className={styles.breadcrumb}>
          <Link href="/baskets">Baskets</Link>
          <span>/</span>
          <span>Create</span>
        </div>
        <h1 className={styles.title}>Create a basket</h1>
        <section className={`card ${styles.studio}`}>
          <div className={styles.toolbar}>
            <label>
              <span className={styles.fieldLabel}>Assets (minimum 2)</span>
              <SearchableMultiSelectDropdown
                className={styles.assetPicker}
                value={selected}
                onChange={onAssetsChange}
                options={options}
                placeholder="Select assets"
                searchPlaceholder="Search assets"
                ariaLabel="Select at least two basket assets"
                triggerContent={
                  <span className={styles.assetTrigger}>
                    {picked.length > 0 && <LogoStack legs={picked} size={24} max={4} />}
                    <span>
                      {selected.length}/{MAX_ASSETS} selected
                    </span>
                  </span>
                }
              />
            </label>
            <div>
              <span className={styles.fieldLabel}>Quote</span>
              <div className={styles.quote}>
                {QUOTES.map((q) => (
                  <button
                    key={q}
                    data-on={quote === q || undefined}
                    aria-pressed={quote === q}
                    onClick={() => {
                      setQuote(q);
                      setSelected([]);
                      setFocused(null);
                      setShares({});
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className={styles.layout} data-setup-visible={setupVisible || undefined}>
            <div className={styles.builder}>
              <div className={styles.sectionHead}>
                <b className="label-row">
                  Composition
                  <Tooltip term="compositionEditor" align="left" side="bottom" />
                </b>
              </div>
              {legs.length < 2 ? (
                <div className={styles.emptyMap}>Select at least two assets.</div>
              ) : (
                <>
                  <CompositionTreemap
                    items={tiles}
                    className={styles.treemap}
                    label="Initial NAV share; choose an asset to adjust"
                    selectedId={focused ?? undefined}
                    onSelect={setFocused}
                  />
                  <div className={styles.distribution}>
                    <div className={styles.distributionHead}>
                      <b>
                        Adjusting{" "}
                        <span className="num">
                          {focusedLeg?.asset.symbol} {focusedPct}%
                        </span>{" "}
                        distribution
                      </b>
                      <Tooltip term="distributionShare" align="right" side="bottom" />
                    </div>
                    <input
                      className={styles.distributionRange}
                      type="range"
                      min={1}
                      max={maxPct}
                      value={Math.min(focusedPct, maxPct)}
                      style={{ "--distribution-share": `${focusedPct}%` } as CSSProperties}
                      aria-label={`${focusedLeg?.asset.symbol} distribution`}
                      onChange={(event) => onDistribution(Number(event.target.value))}
                    />
                  </div>
                </>
              )}
            </div>

            {setupVisible && (
              <aside className={styles.preview}>
                <div className={styles.setupHeader}>
                  <b>Basket setup</b>
                  <span>{quote}</span>
                </div>
                <div
                  className={styles.setupProgress}
                  role="progressbar"
                  aria-label="Basket setup progress"
                  aria-valuemin={1}
                  aria-valuemax={3}
                  aria-valuenow={Math.min(step + 1, 3)}
                >
                  <span style={{ "--setup-progress": progress } as CSSProperties} />
                </div>
                <div className={styles.setupStage} aria-live="polite">
                  {step === 0 && (
                    <div key="name" className={styles.setupStep}>
                      <span className={styles.setupCount}>1 of 3</span>
                      <h2>Choose a name</h2>
                      <label className={styles.setupField}>
                        <span>Basket name</span>
                        <input
                          className="input subtle"
                          value={name}
                          placeholder="AI Leaders"
                          autoComplete="off"
                          onChange={(event) => setName(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") next();
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {step === 1 && (
                    <div key="ticker" className={styles.setupStep}>
                      <span className={styles.setupCount}>2 of 3</span>
                      <h2>Pick your ticker</h2>
                      <label className={styles.setupField}>
                        <span>Ticker</span>
                        <input
                          className={`input subtle num ${styles.tickerInput}`}
                          value={ticker}
                          placeholder="AI4"
                          autoComplete="off"
                          spellCheck={false}
                          onChange={(event) => setTicker(event.target.value.toUpperCase())}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") next();
                          }}
                        />
                      </label>
                    </div>
                  )}
                  {step === 2 && (
                    <div key="nav" className={styles.setupStep}>
                      <span className={styles.setupCount}>3 of 3</span>
                      <h2>Set your NAV price</h2>
                      <label className={styles.setupNavEditor}>
                        <span aria-hidden>$</span>
                        <input
                          className="num"
                          value={navInput}
                          inputMode="decimal"
                          aria-label="Starting NAV in USD"
                          onChange={(event) => setNavInput(pruneDecimalInput(event.target.value))}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") next();
                          }}
                        />
                        <small>{quote}</small>
                      </label>
                    </div>
                  )}
                  {step === 3 && (
                    <div key="summary" className={`${styles.setupStep} ${styles.setupSummary}`}>
                      <span className={styles.setupCount}>Basket preview</span>
                      <h2>{name}</h2>
                      <div className={styles.setupSummaryValues}>
                        <strong>{ticker}</strong>
                        <span className="num">{usd(nav)} NAV</span>
                      </div>
                    </div>
                  )}
                </div>
                <div className={styles.setupActions}>
                  {step > 0 ? (
                    <button type="button" className="btn btn-line" onClick={() => setStep((s) => Math.max(0, s - 1))}>
                      Back
                    </button>
                  ) : (
                    <span />
                  )}
                  {step < 3 ? (
                    <button type="button" className="btn btn-ink" disabled={!canAdvance} onClick={next}>
                      Next
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn btn-ink"
                      disabled={working || !ready || wrongNetwork || wallet.connecting}
                      onClick={() => (connected ? void deploy() : wallet.connect())}
                    >
                      {confirmLabel}
                    </button>
                  )}
                </div>
              </aside>
            )}
          </div>

          <details className={styles.details}>
            <summary>Review details</summary>
            <div className={styles.detailsBody}>
              <div className={styles.facts}>
                <div className={styles.fact}>
                  <span>Assets</span>
                  <b>{picked.length}</b>
                </div>
                <div className={styles.fact}>
                  <span>1% capacity</span>
                  <b className="num">{capacity > 0 ? usd(capacity) : "—"}</b>
                </div>
                <div className={styles.fact}>
                  <span>Mint / redeem fee</span>
                  <b>
                    {pct(PROTOCOL_FEE)} / {pct(PROTOCOL_FEE)}
                  </b>
                </div>
                <div className={styles.fact}>
                  <span>Quote</span>
                  <b>{quote}</b>
                </div>
                <div className={styles.fact}>
                  <span>Owner</span>
                  <b>{wallet.address ? short(wallet.address) : "Connect wallet"}</b>
                </div>
              </div>
              <div className={styles.unitRows}>
                {legs.map((leg, i) => (
                  <div key={leg.asset.address} className={styles.unitRow}>
                    <b>{leg.asset.symbol}</b>
                    <span className={styles.right}>{qty(leg.qtyPerShare)} units / share</span>
                    <span className={styles.right}>{pct(costs[i] / costSum)} capacity cost</span>
                  </div>
                ))}
              </div>
            </div>
          </details>
        </section>
        <Status text={status} />
      </div>
    </main>
  );
}
