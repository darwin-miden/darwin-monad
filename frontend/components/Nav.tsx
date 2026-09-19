"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { Dropdown } from "@/components/ui/Dropdown";
import { DEPLOYMENT, testUsdAbi } from "@/lib/contracts";
import { useDarwin } from "@/lib/data/store";
import { short } from "@/lib/format";
import { useSendTx } from "@/lib/tx";
import { chain, useWallet } from "@/lib/wallet";

const LINKS = [
  ["/baskets", "Baskets"],
  ["/portfolio", "Portfolio"],
  ["/leaderboard", "Leaderboard"],
  ["/docs", "Docs"],
] as const;

const WALLET_OPTIONS = [
  { value: "faucet", label: "Get 10,000 test USDC" },
  { value: "explorer", label: "View on explorer" },
  { value: "change", label: "Change" },
  { value: "disconnect", label: "Disconnect" },
];

export function Nav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wallet = useWallet();
  const sendTx = useSendTx();
  const { refresh } = useDarwin();
  const onCreate = pathname === "/create";

  const onWalletOption = (value: string) => {
    setOpen(false);
    if (value === "faucet") {
      sendTx({ address: DEPLOYMENT.usd, abi: testUsdAbi, functionName: "faucet" })
        .then(() => refresh())
        .catch(() => {});
    } else if (value === "explorer" && wallet.address) {
      window.open(`${chain.blockExplorers.default.url}/address/${wallet.address}`, "_blank", "noopener");
    } else if (value === "change") wallet.change();
    else wallet.disconnect();
  };

  const closeMenu = (refocus = false) => {
    setOpen(false);
    if (refocus) requestAnimationFrame(() => triggerRef.current?.focus());
  };

  const links = () =>
    LINKS.map(([href, label]) => {
      const active =
        pathname === href ||
        pathname?.startsWith(`${href}/`) ||
        (href === "/baskets" && (pathname?.startsWith("/basket/") || pathname?.startsWith("/stock/")));
      return (
        <Link key={href} href={href} data-on={active || undefined} aria-current={active ? "page" : undefined} onClick={() => setOpen(false)}>
          {label}
        </Link>
      );
    });

  const walletControl = (inMenu = false) =>
    wallet.isConnected && wallet.address ? (
      <Dropdown
        className="wallet-select"
        value={null}
        onChange={onWalletOption}
        options={WALLET_OPTIONS}
        ariaLabel={`Wallet options for ${short(wallet.address)}`}
        triggerContent={short(wallet.address)}
      />
    ) : (
      <button
        className="btn btn-sm btn-ink"
        onClick={() => {
          if (inMenu) setOpen(false);
          wallet.connect();
        }}
        disabled={wallet.connecting}
      >
        {wallet.hasWallet ? "Connect wallet" : "Install a wallet"}
      </button>
    );

  return (
    <div className="header-wrap">
      <header className="header">
        <Link href="/" className="brand" aria-label="Darwin, home" aria-current={pathname === "/" ? "page" : undefined}>
          <span className="brand-mark" aria-hidden>
            <span />
            <span />
            <span />
            <span />
          </span>
          <span className="brand-name">Darwin</span>
        </Link>
        <nav className="topnav" aria-label="Primary">
          {links()}
        </nav>
        <div className="header-actions">
          <Link
            href="/create"
            className="btn btn-sm btn-line"
            style={onCreate ? { borderColor: "var(--ink)" } : undefined}
            aria-current={onCreate ? "page" : undefined}
          >
            Create basket
          </Link>
          {walletControl()}
        </div>
        <div
          className="mobile-nav"
          onKeyDown={(event) => {
            if (event.key === "Escape") closeMenu(true);
          }}
        >
          <button
            ref={triggerRef}
            type="button"
            className="mobile-nav-trigger"
            aria-label={open ? "Close navigation" : "Open navigation"}
            aria-expanded={open}
            aria-controls="mobile-primary-navigation"
            onClick={() => setOpen((v) => !v)}
          >
            <span />
            <span />
          </button>
          {open && (
            <>
              <button type="button" className="mobile-nav-backdrop" aria-label="Close navigation" tabIndex={-1} onClick={() => closeMenu()} />
              <div className="mobile-nav-panel" id="mobile-primary-navigation">
                <nav className="mobile-nav-links" aria-label="Mobile primary">
                  {links()}
                </nav>
                <div className="mobile-nav-actions">
                  <Link href="/create" className="btn btn-line" aria-current={onCreate ? "page" : undefined} onClick={() => setOpen(false)}>
                    Create basket
                  </Link>
                  {walletControl(true)}
                </div>
              </div>
            </>
          )}
        </div>
      </header>
    </div>
  );
}
