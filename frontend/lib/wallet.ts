"use client";

import { useCallback, useSyncExternalStore } from "react";
import { createConfig, http, injected, mock, useConnect, useConnection, useConnectors, useDisconnect } from "wagmi";
import { monadTestnet } from "viem/chains";

/** Account used when the browser has no injected wallet, so the demo stays usable. */
export const DEMO_ACCOUNT = "0xda7a000000000000000000000000000000000001";

export const chain = monadTestnet;

export const wagmiConfig = createConfig({
  chains: [monadTestnet],
  connectors: [injected({ shimDisconnect: true }), mock({ accounts: [DEMO_ACCOUNT], features: { reconnect: true } })],
  transports: { [monadTestnet.id]: http() },
  // Connect goes through window.ethereum; discovered EIP-6963 wallets would each be probed
  // with eth_accounts on every page load, which some extensions reject noisily.
  multiInjectedProviderDiscovery: false,
  ssr: true,
});

const subscribeNoop = () => () => {};
const hasInjected = () => typeof window !== "undefined" && "ethereum" in window && Boolean((window as { ethereum?: unknown }).ethereum);

export function useWallet() {
  const { address, isConnected } = useConnection();
  const connectors = useConnectors();
  const { mutate: connect, isPending } = useConnect();
  const { mutate: disconnect } = useDisconnect();
  const injectedAvailable = useSyncExternalStore(subscribeNoop, hasInjected, () => false);

  const open = useCallback(() => {
    const preferred = connectors.find((c) => (injectedAvailable ? c.type === "injected" : c.type === "mock"));
    if (preferred) connect({ connector: preferred, chainId: monadTestnet.id });
  }, [connect, connectors, injectedAvailable]);

  const change = useCallback(() => {
    disconnect(undefined, { onSettled: () => open() });
  }, [disconnect, open]);

  return {
    address,
    isConnected,
    connecting: isPending,
    connect: open,
    disconnect: () => disconnect(),
    change,
  };
}
