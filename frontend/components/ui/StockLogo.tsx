"use client";

import { memo, useState, type CSSProperties } from "react";

const LOCAL_LOGOS: Record<string, string> = {
  CRCL: "/logos/crcl.svg",
  SKHY: "/logos/skhy.svg",
  SPCX: "/logos/spcx.svg",
};

const logoUrl = (symbol: string) =>
  LOCAL_LOGOS[symbol] ?? `https://assets.parqet.com/logos/symbol/${symbol}?format=png&size=100`;

export const StockLogo = memo(function StockLogo({ sym, size = 22 }: { sym: string; size?: number }) {
  const symbol = sym.trim().toUpperCase();
  const src = logoUrl(symbol);
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size, borderRadius: 999 };

  if (failed !== src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- external logo CDN, fixed tiny sizes
      <img className="slogo" src={src} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(src)} style={style} />
    );
  }
  return (
    <span aria-hidden className="slogo slogo-fb" style={{ ...style, fontSize: Math.round(0.4 * size), letterSpacing: "-0.02em" }}>
      {symbol.slice(0, 2)}
    </span>
  );
});

export const LogoStack = memo(function LogoStack({
  legs,
  size = 28,
  max = 3,
}: {
  legs: { symbol: string }[];
  size?: number;
  max?: number;
}) {
  const overlap = Math.round(0.29 * size);
  return (
    <span className="stack" style={{ "--overlap": `${overlap}px` } as CSSProperties} aria-hidden>
      {legs.slice(0, max).map((leg, i) => (
        <StockLogo key={`${leg.symbol}-${i}`} sym={leg.symbol} size={size} />
      ))}
    </span>
  );
});
