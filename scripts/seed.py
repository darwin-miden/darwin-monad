#!/usr/bin/env python3
"""Idempotent starter-basket seeding using node-side gas estimates.

Forge's local simulation prices gas like Ethereum, which under-estimates Monad's cold-access costs
(and Monad bills the full gas limit). This script asks the Monad node for every estimate instead.

Usage: python3 scripts/seed.py [--no-buy]
"""
import argparse
import json
import os
import subprocess
import time

ROOT = os.path.normpath(os.path.join(os.path.dirname(__file__), ".."))
CONTRACTS = os.path.join(ROOT, "contracts")
NAV = 100 * 10**18

BASKETS = [
    ("Magnificent 7", "MAG7", "The seven mega-caps driving the index, equal-weighted at launch.",
     [("AAPL", 1429), ("MSFT", 1429), ("NVDA", 1429), ("GOOGL", 1429), ("AMZN", 1428), ("META", 1428), ("TSLA", 1428)],
     25_000),
    ("AI Compute", "AICORE", "Chips and software powering the AI build-out.",
     [("NVDA", 4000), ("AVGO", 2500), ("AMD", 2000), ("PLTR", 1500)], 18_000),
    ("Crypto Equities", "CRYPTO", "Listed companies with direct crypto exposure.",
     [("COIN", 4000), ("MSTR", 3000), ("HOOD", 3000)], 9_000),
    ("AI & Big Tech Titans", "TITANS", "Four platform giants, 25% each at launch.",
     [("META", 2500), ("GOOGL", 2500), ("NVDA", 2500), ("AAPL", 2500)], 12_000),
    ("Screen Time", "SCREEN", "Where attention goes: streaming, social and devices.",
     [("NFLX", 3000), ("META", 3000), ("AAPL", 2000), ("AMZN", 2000)], 6_000),
]


def load_env() -> dict:
    env = {}
    with open(os.path.join(CONTRACTS, ".env")) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, v = line.split("=", 1)
                env[k] = v
    return env


ENV = load_env()
RPC = ENV["RPC_URL"]


def cast(*args: str) -> str:
    res = subprocess.run(["cast", *args], capture_output=True, text=True)
    if res.returncode != 0:
        raise RuntimeError(f"cast {' '.join(args[:3])}: {res.stderr.strip()}")
    return res.stdout.strip()


def call(to: str, sig: str, *args: str) -> str:
    return cast("call", to, sig, *args, "--rpc-url", RPC).split(" ")[0]


def send(to: str, sig: str, *args: str) -> dict:
    sender = cast("wallet", "address", "--private-key", ENV["PRIVATE_KEY"])
    est = int(cast("estimate", to, sig, *args, "--from", sender, "--rpc-url", RPC))
    receipt = json.loads(cast(
        "send", to, sig, *args,
        "--gas-limit", str(est * 105 // 100),
        "--private-key", ENV["PRIVATE_KEY"], "--rpc-url", RPC, "--json",
    ))
    if receipt["status"] != "0x1":
        raise RuntimeError(f"tx failed: {receipt['transactionHash']}")
    print(f"  {sig.split('(')[0]:8} gas {int(receipt['gasUsed'], 16):>9,}  {receipt['transactionHash']}", flush=True)
    return receipt


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--no-buy", action="store_true")
    args = parser.parse_args()

    with open(os.path.join(CONTRACTS, "deployments", "10143.json")) as f:
        d = json.load(f)
    stock_of = dict(zip(d["symbols"], d["stocks"]))
    me = cast("wallet", "address", "--private-key", ENV["PRIVATE_KEY"])

    count = int(call(d["factory"], "deployedCount()(uint256)"))
    existing = {}
    for i in range(count):
        vault = call(d["factory"], "deployed(uint256)(address)", str(i))
        existing[call(vault, "symbol()(string)").strip('"')] = vault

    for name, symbol, description, legs, buy_usd in BASKETS:
        print(symbol, flush=True)
        vault = existing.get(symbol)
        if vault is None:
            tokens = [stock_of[s] for s, _ in legs]
            units = [NAV * w // 10_000 * 10**18 // int(call(d["oracle"], "getPrice(address)(uint256)", t))
                     for (_, w), t in zip(legs, tokens)]
            send(
                d["factory"],
                "deploy(string,string,string,address[],uint256[],uint16,uint16)",
                name, symbol, description,
                "[" + ",".join(tokens) + "]", "[" + ",".join(map(str, units)) + "]", "10", "10",
            )
            vault = call(d["factory"], "deployed(uint256)(address)", str(len(existing)))
            existing[symbol] = vault
        print(f"  vault    {vault}", flush=True)

        if not args.no_buy and int(call(vault, "balanceOf(address)(uint256)", me)) == 0:
            deadline = str(int(time.time()) + 3600)
            send(d["router"], "buy(address,uint256,uint256,address,uint256)",
                 vault, str(buy_usd * 10**6), "0", me, deadline)


if __name__ == "__main__":
    main()
