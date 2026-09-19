"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { WagmiProvider } from "wagmi";
import { DarwinProvider } from "@/lib/data/store";
import { wagmiConfig } from "@/lib/wallet";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <DarwinProvider>{children}</DarwinProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
