#!/usr/bin/env python3
"""Price keeper: pushes live US stock prices (Yahoo Finance) to the Darwin PriceOracle.

Usage:
    python3 scripts/keeper.py            # loop forever (default every 60s)
    python3 scripts/keeper.py --once     # single update

Reads PRIVATE_KEY and RPC_URL from contracts/.env and addresses from
contracts/deployments/<chainId>.json. Requires Foundry's `cast` on PATH.
"""
import argparse
import json
import os
import subprocess
import sys
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from decimal import Decimal

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
CONTRACTS = os.path.join(ROOT, "contracts")


def load_env() -> dict:
    env = {}
    with open(os.path.join(CONTRACTS, ".env")) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k] = v
    return env


def yahoo_price(symbol: str) -> Decimal:
    req = urllib.request.Request(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1m",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        meta = json.load(r)["chart"]["result"][0]["meta"]
    return Decimal(str(meta["regularMarketPrice"]))


def onchain_price(oracle: str, token: str, rpc: str) -> int:
    out = subprocess.run(
        ["cast", "call", oracle, "getPrice(address)(uint256)", token, "--rpc-url", rpc],
        capture_output=True, text=True, check=True,
    ).stdout
    return int(out.split()[0])


def push(deployment: dict, env: dict) -> None:
    symbols = deployment["symbols"]
    stocks = deployment["stocks"]
    with ThreadPoolExecutor(max_workers=8) as pool:
        prices = list(pool.map(yahoo_price, symbols))
        current = list(pool.map(lambda t: onchain_price(deployment["oracle"], t, env["RPC_URL"]), stocks))
    raw = [int(p * Decimal(10) ** 18) for p in prices]

    # Only publish prices that moved: gas is billed on the full limit, and markets are closed on weekends.
    changed = [i for i in range(len(stocks)) if raw[i] != current[i]]
    if not changed:
        print(f"[{time.strftime('%H:%M:%S')}] no price change", flush=True)
        return
    symbols = [symbols[i] for i in changed]
    prices = [prices[i] for i in changed]
    cmd = [
        "cast", "send", deployment["oracle"],
        "setPrices(address[],uint256[])",
        "[" + ",".join(stocks[i] for i in changed) + "]",
        "[" + ",".join(str(raw[i]) for i in changed) + "]",
        "--rpc-url", env["RPC_URL"],
        "--private-key", env["PRIVATE_KEY"],
        "--json",
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    if res.returncode != 0:
        print("setPrices failed:", res.stderr.strip(), file=sys.stderr)
        return
    tx = json.loads(res.stdout)["transactionHash"]
    summary = " ".join(f"{s}={p}" for s, p in zip(symbols, prices))
    print(f"[{time.strftime('%H:%M:%S')}] {tx} {summary}", flush=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--once", action="store_true")
    parser.add_argument("--interval", type=int, default=60)
    parser.add_argument("--chain-id", default="10143")
    parser.add_argument("--rpc-url", help="override RPC_URL from contracts/.env")
    parser.add_argument("--private-key", help="override PRIVATE_KEY from contracts/.env")
    args = parser.parse_args()

    env = load_env()
    if args.rpc_url:
        env["RPC_URL"] = args.rpc_url
    if args.private_key:
        env["PRIVATE_KEY"] = args.private_key
    with open(os.path.join(CONTRACTS, "deployments", f"{args.chain_id}.json")) as f:
        deployment = json.load(f)

    while True:
        try:
            push(deployment, env)
        except Exception as e:  # keep the loop alive through transient API/RPC errors
            print("keeper error:", e, file=sys.stderr, flush=True)
        if args.once:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    main()
