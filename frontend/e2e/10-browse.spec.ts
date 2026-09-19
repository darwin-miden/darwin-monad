import { formatUnits } from "viem";
import { cta, fillAmount, openBasket } from "./app";
import { allBaskets, deployment, publicClient, quoteBuy } from "./chain";
import { expect, test } from "./wallet";

const oracleAbi = [
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [{ name: "token", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

test.describe("browse (read-only, live data)", () => {
  test("home shows the live featured basket and the explore list", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Trade a portfolio as one share." })).toBeVisible();
    await expect(page.getByText("Magnificent 7").first()).toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("heading", { name: "Explore baskets" })).toBeVisible();
    // 30D change comes from real closing prices x fixed units.
    await expect(page.getByText(/[+-]\d+\.\d{2}%/).first()).toBeVisible({ timeout: 30_000 });
  });

  test("baskets page lists every on-chain basket and filters by search", async ({ page }) => {
    const baskets = await allBaskets();
    expect(baskets.length).toBeGreaterThanOrEqual(5);
    await page.goto("/baskets");
    for (const b of baskets.slice(0, 5)) {
      await expect(page.getByText(b.name, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    }
    await page.getByRole("searchbox").or(page.getByPlaceholder(/Search/)).first().fill("crypto");
    await expect(page.getByText("Crypto Equities").first()).toBeVisible();
    await expect(page.getByText("Magnificent 7")).toHaveCount(0);
  });

  test("basket page shows NAV, chart and the exact router quote", async ({ page }) => {
    const crypto = (await allBaskets()).find((b) => b.symbol === "CRYPTO")!;
    await openBasket(page, crypto.vault);
    await expect(page.getByRole("heading", { name: "Crypto Equities" })).toBeVisible();
    const nav = Number(formatUnits(crypto.nav, 18)).toFixed(2);
    await expect(page.getByText(`$${nav}`).first()).toBeVisible();
    await expect(page.locator("svg path").first()).toBeVisible();

    await fillAmount(page, "Buy", "CRYPTO", "250");
    const quoted = await quoteBuy(crypto.vault, BigInt(250_000_000));
    const shown = Number(formatUnits(quoted, 18));
    // The receive well renders the on-chain quote (qty() formatting, 4+ significant digits).
    const truncated = (Math.floor(shown * 100) / 100).toFixed(2).replace(".", "\\.");
    await expect(page.getByText(new RegExp(`^${truncated}\\d*$`)).first()).toBeVisible({ timeout: 20_000 });
    // Not connected: the CTA asks for a wallet.
    await expect(cta(page)).toHaveText(/Connect wallet|Install a wallet/);
  });

  test("range tabs switch the chart between hourly and daily history", async ({ page }) => {
    const mag7 = (await allBaskets()).find((b) => b.symbol === "MAG7")!;
    await openBasket(page, mag7.vault);
    for (const range of ["7D", "90D", "1Y", "30D"]) {
      await page.getByRole("button", { name: range, exact: true }).first().click();
      await expect(page.getByText(/[+-]\d+\.\d{2}%/).first()).toBeVisible({ timeout: 30_000 });
    }
  });

  test("stock page shows the oracle price and the baskets holding it", async ({ page }) => {
    const nvda = deployment.stocks[deployment.symbols.indexOf("NVDA")];
    const price = await publicClient.readContract({ address: deployment.oracle, abi: oracleAbi, functionName: "getPrice", args: [nvda] });
    await page.goto("/stock/NVDA");
    await expect(page.getByRole("heading", { name: "NVIDIA" })).toBeVisible({ timeout: 30_000 });
    const usd = Number(formatUnits(price, 18)).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await expect(page.getByText(`$${usd}`).first()).toBeVisible();
    await expect(page.getByText("Magnificent 7").first()).toBeVisible();
  });

  test("leaderboard ranks the seed creator by backed value", async ({ page }) => {
    await page.goto("/leaderboard");
    await expect(page.getByText(/0x74b5…959c|0x74b5\.\.\.959c/i).first()).toBeVisible({ timeout: 30_000 });
  });

  test("docs list the live contract addresses", async ({ page }) => {
    await page.goto("/docs");
    for (const address of [deployment.factory, deployment.router, deployment.lens]) {
      await expect(page.getByText(address).first()).toBeVisible();
    }
  });

  test("portfolio asks to connect when no wallet is connected", async ({ page }) => {
    await page.goto("/portfolio");
    await expect(page.getByText("Connect a wallet to view your portfolio.")).toBeVisible();
  });

  test("history API returns aligned real closes", async ({ request }) => {
    const res = await request.get("/api/history?symbols=AAPL,NVDA,COIN&range=3mo&interval=1d");
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.missing).toEqual([]);
    expect(body.timestamps.length).toBeGreaterThan(40);
    for (const s of ["AAPL", "NVDA", "COIN"]) expect(body.closes[s]).toHaveLength(body.timestamps.length);
  });
});
