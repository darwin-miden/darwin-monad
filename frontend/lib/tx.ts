"use client";

import { useCallback } from "react";
import { useConnection, usePublicClient, useSwitchChain, useWriteContract } from "wagmi";
import type { Abi, BaseError, Hash, TransactionReceipt } from "viem";
import { chain } from "./wallet";

type WriteRequest = { address: `0x${string}`; abi: Abi; functionName: string; args?: readonly unknown[] };

export const txUrl = (hash: string) => `${chain.blockExplorers.default.url}/tx/${hash}`;

/** Short, human error for a failed wallet or contract call. */
export function errorMessage(e: unknown): string {
  const err = e as BaseError & { details?: string };
  const msg = err?.shortMessage || err?.message || "Something went wrong";
  if (/user (rejected|denied)|rejected the request/i.test(`${msg} ${err?.details ?? ""}`)) return "Rejected in wallet.";
  const reason = /reverted with the following (?:reason|signature):\s*(.+)/i.exec(err?.message ?? "")?.[1];
  const text = reason ? `Reverted: ${reason.split("\n")[0]}` : msg;
  return text.length > 160 ? `${text.slice(0, 160)}…` : text;
}

/** Sends a contract write on Monad Testnet (switching chains first if needed) and waits for its receipt. */
export function useSendTx() {
  const { chainId } = useConnection();
  const client = usePublicClient({ chainId: chain.id });
  const { switchChainAsync } = useSwitchChain();
  const { writeContractAsync } = useWriteContract();

  return useCallback(
    async (request: WriteRequest): Promise<{ hash: Hash; receipt: TransactionReceipt }> => {
      if (chainId !== chain.id) await switchChainAsync({ chainId: chain.id });
      const hash = await writeContractAsync({ ...request, chainId: chain.id } as never);
      const receipt = await client!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") throw new Error("Transaction reverted on-chain.");
      return { hash, receipt };
    },
    [chainId, client, switchChainAsync, writeContractAsync],
  );
}
