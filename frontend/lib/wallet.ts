"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createConfig, http, injected, useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { monadTestnet } from "viem/chains";

export const chain = monadTestnet;

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true })],
  // NEXT_PUBLIC_RPC_URL points the app at another node (e.g. a local fork for end-to-end tests).
  transports: { [monadTestnet.id]: http(process.env.NEXT_PUBLIC_RPC_URL || undefined) },
  // Connect goes through window.ethereum; discovered EIP-6963 wallets would each be probed
  // with eth_accounts on every page load, which some extensions reject noisily.
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

const WALLET_DOWNLOAD_URL = "https://rabby.io";

const subscribeNoop = () => () => {};
const hasInjected = () => typeof window !== "undefined" && "ethereum" in window && Boolean((window as { ethereum?: unknown }).ethereum);

export function useWallet() {
  const { address, isConnected, chainId } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const injectedAvailable = useSyncExternalStore(subscribeNoop, hasInjected, () => false);

  const open = useCallback(() => {
    const connector = connectors.find((c) => c.type === "injected");
    if (!injectedAvailable || !connector) {
      window.open(WALLET_DOWNLOAD_URL, "_blank", "noopener");
      return;
    }
    connect({ connector, chainId: monadTestnet.id });
  }, [connect, connectors, injectedAvailable]);

  const change = useCallback(() => {
    disconnect(undefined, { onSettled: () => open() });
  }, [disconnect, open]);

  return {
    address,
    isConnected,
    wrongChain: isConnected && chainId !== monadTestnet.id,
    hasWallet: injectedAvailable,
    connecting: isPending,
    connect: open,
    disconnect: () => disconnect(),
    change,
  };
}
