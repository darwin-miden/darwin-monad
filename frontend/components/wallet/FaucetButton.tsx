"use client";

import { useState } from "react";
import { useReadContract } from "wagmi";
import { DEPLOYMENT, testUsdAbi } from "@/lib/contracts";
import { useDarwin } from "@/lib/data/store";
import { errorMessage, useSendTx } from "@/lib/tx";
import { useWallet } from "@/lib/wallet";

/** TestUSD.FAUCET_COOLDOWN */
const COOLDOWN_S = 3600;

/** Claims 10,000 test USDC from the TestUSD faucet (once per hour per wallet). */
export function FaucetButton({ className = "btn btn-line" }: { className?: string }) {
  const { address } = useWallet();
  const { refresh } = useDarwin();
  const sendTx = useSendTx();
  const [working, setWorking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const { data: lastClaim, dataUpdatedAt } = useReadContract({
    address: DEPLOYMENT.usd,
    abi: testUsdAbi,
    functionName: "lastClaim",
    args: address ? [address] : undefined,
    query: { enabled: !!address, refetchInterval: 30_000 },
  });

  const readyAt = lastClaim ? Number(lastClaim) + COOLDOWN_S : 0;
  const waitMin = Math.ceil((readyAt - dataUpdatedAt / 1000) / 60);
  const cooling = waitMin > 0;

  async function claim() {
    setWorking(true);
    setNote(null);
    try {
      await sendTx({ address: DEPLOYMENT.usd, abi: testUsdAbi, functionName: "faucet" });
      await refresh();
    } catch (e) {
      setNote(errorMessage(e));
    } finally {
      setWorking(false);
    }
  }

  if (!address) return null;
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
      <button className={className} onClick={claim} disabled={working || cooling}>
        {working ? "Claiming…" : cooling ? `Faucet ready in ${waitMin} min` : "Get 10,000 test USDC"}
      </button>
      {note && <small className="c-negative">{note}</small>}
    </span>
  );
}
