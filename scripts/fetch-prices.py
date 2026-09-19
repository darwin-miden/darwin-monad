#!/usr/bin/env python3
"""Fetch latest US stock prices from Yahoo Finance and write contracts/deployments/prices.json.

Prices are written as 18-decimal integers (USD per 1 token) for the deploy script.
"""
import json
import os
import urllib.request
from decimal import Decimal

STOCKS = [
    ("AAPL", "Apple"),
    ("MSFT", "Microsoft"),
    ("NVDA", "NVIDIA"),
    ("GOOGL", "Alphabet"),
    ("AMZN", "Amazon"),
    ("META", "Meta Platforms"),
    ("TSLA", "Tesla"),
    ("AVGO", "Broadcom"),
    ("AMD", "AMD"),
    ("NFLX", "Netflix"),
    ("PLTR", "Palantir"),
    ("COIN", "Coinbase"),
    ("MSTR", "Strategy"),
    ("HOOD", "Robinhood"),
]


def price(symbol: str) -> Decimal:
    req = urllib.request.Request(
        f"https://query1.finance.yahoo.com/v8/finance/chart/{symbol}?range=1d&interval=1d",
        headers={"User-Agent": "Mozilla/5.0"},
    )
    with urllib.request.urlopen(req, timeout=15) as r:
        meta = json.load(r)["chart"]["result"][0]["meta"]
    return Decimal(str(meta["regularMarketPrice"]))


def main() -> None:
    out = {"symbols": [], "names": [], "prices": []}
    for symbol, name in STOCKS:
        p = price(symbol)
        out["symbols"].append(symbol)
        out["names"].append(name)
        out["prices"].append(int(p * Decimal(10) ** 18))
        print(f"{symbol:6} {p}")
    path = os.path.join(os.path.dirname(__file__), "..", "contracts", "deployments", "prices.json")
    with open(path, "w") as f:
        json.dump(out, f, indent=2)
    print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()
