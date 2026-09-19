import { useId } from "react";

const TERMS = {
  basketComposition: {
    label: "About basket composition",
    description: "Each block is an asset. Its area matches its current share of basket NAV.",
  },
  compositionEditor: {
    label: "How to adjust composition",
    description: "Select an asset block, then adjust its share. The other assets redistribute automatically.",
  },
  distributionShare: {
    label: "About asset distribution",
    description:
      "The percentage is this asset's share of starting NAV. Changing it redistributes the remainder across the other assets.",
  },
  navPerShare: {
    label: "About NAV per share",
    description: "The current value of the fixed asset units backing one basket share.",
  },
  portfolioPerformance: {
    label: "About portfolio performance",
    description: "Historical value of the assets backing your current basket positions over the selected period.",
  },
  underlyingExposure: {
    label: "About underlying exposure",
    description: "Assets backing your basket shares, combined across baskets. Block area matches current value.",
  },
  basketHoldings: {
    label: "About basket holdings",
    description: "Basket shares held by this wallet. Each row shows current value and its share of the portfolio.",
  },
  relatedBaskets: {
    label: "About baskets containing this asset",
    description: "Baskets that contain this asset. Each bar shows the basket's current NAV mix.",
  },
  referenceMarket: {
    label: "About the reference market",
    description: "External stock-market data used for price context. Basket backing and execution remain on-chain.",
  },
  onChainLiquidity: {
    label: "About on-chain liquidity",
    description:
      "Measured depth in the available trading routes. Greater depth generally supports larger trades with less impact.",
  },
  onePercentCapacity: {
    label: "About one percent capacity",
    description: "Estimated trade size at roughly 1% price impact, limited by the basket's thinnest route.",
  },
  estimatedOutput: {
    label: "About estimated output",
    description: "The quoted amount can change before the transaction executes.",
  },
  maxSlippage: {
    label: "About max slippage",
    description: "The trade cancels if the execution price moves beyond this limit.",
  },
  mintFee: {
    label: "About the mint fee",
    description: "Added to the required assets and retained as basket backing.",
  },
  redemptionFee: {
    label: "About the redemption fee",
    description: "Deducted from returned assets and retained as basket backing.",
  },
  mintCapacity: {
    label: "About mint capacity",
    description: "Shares available under the current issuance allowance. Capacity refills continuously over an hour.",
  },
  redemptionCapacity: {
    label: "About redemption capacity",
    description: "Shares available under the current redemption allowance. Capacity refills continuously over an hour.",
  },
  depositAssets: {
    label: "About required assets",
    description: "Depositing supplies every listed asset in exchange for newly minted basket shares.",
  },
  redeemAssets: {
    label: "About returned assets",
    description: "Redeeming burns basket shares and returns the listed underlying assets.",
  },
  costVsWorth: {
    label: "About cost versus worth",
    description: "Current pool price, including fees and impact, compared with the value of one share's backing.",
  },
} as const;

export type TooltipTerm = keyof typeof TERMS;

export function Tooltip({
  term,
  align = "center",
  side = "top",
}: {
  term: TooltipTerm;
  align?: "left" | "center" | "right";
  side?: "top" | "bottom";
}) {
  const id = useId();
  const entry = TERMS[term];
  return (
    <span className="tip" data-align={align} data-side={side}>
      <button type="button" className="tip-btn" aria-label={entry.label} aria-describedby={id}>
        ?
      </button>
      <span id={id} role="tooltip" className="tip-bubble">
        {entry.description}
      </span>
    </span>
  );
}
