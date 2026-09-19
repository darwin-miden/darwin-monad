import type { Address } from "viem";
import { connect, cta, fillAmount, openBasket, pctDiff, setMode, trade } from "./app";
import {
  allBaskets,
  basketCount,
  faucetReady,
  getBasket,
  holdings,
  publicClient,
  quoteBuy,
  quoteSell,
  shareBalance,
  skipFaucetCooldown,
  stockBalances,
  usdcBalance,
  vaultAbi,
} from "./chain";
import { IS_FORK } from "./env";
import { expect, test } from "./wallet";

const USDC = (n: number) => BigInt(Math.round(n * 1e6));
const WAD = (n: number) => BigInt(Math.round(n * 1e6)) * BigInt(1e12);

test.describe.configure({ mode: "serial" });

test.describe("trade on-chain through the UI", () => {
  let mag7: Address;
  let created: Address | undefined;
  const ticker = `E2E${Date.now().toString(36).slice(-5).toUpperCase()}`;

  test.beforeAll(async () => {
    mag7 = (await allBaskets()).find((b) => b.symbol === "MAG7")!.vault;
  });

  test("connects and claims test USDC from the wallet menu", async ({ page, wallet }) => {
    if (IS_FORK) await skipFaucetCooldown(wallet.address);
    test.skip(!(await faucetReady(wallet.address)), "faucet cooling down for this wallet");
    const before = await usdcBalance(wallet.address);
    await page.goto("/");
    await connect(page);
    await page.getByRole("button", { name: /Wallet options for/ }).click();
    await page.getByRole("option", { name: "Get 10,000 test USDC" }).click();
    const tx = await wallet.waitForTx();
    expect(tx.status).toBe("success");
    expect(tx.label).toBe("faucet");
    expect((await usdcBalance(wallet.address)) - before).toBe(USDC(10_000));
  });

  test("buys MAG7 with USDC: approve + router.buy, shares match the quote", async ({ page, wallet }) => {
    const usdBefore = await usdcBalance(wallet.address);
    const sharesBefore = await shareBalance(mag7, wallet.address);
    const quoted = await quoteBuy(mag7, USDC(1_000));
    await openBasket(page, mag7);
    await connect(page);
    await trade(page, "Buy", "MAG7", "1000");
    await wallet.settle();
    const received = (await shareBalance(mag7, wallet.address)) - sharesBefore;
    const spent = usdBefore - (await usdcBalance(wallet.address));
    expect(pctDiff(received, quoted)).toBeLessThan(0.001);
    expect(spent).toBeLessThanOrEqual(USDC(1_000));
    expect(spent).toBeGreaterThan(USDC(999));
    const labels = wallet.records.slice(-2).map((r) => r.label);
    expect(labels).toContain("buy");
    // ~0.5% all-in cost at NAV $100: 10 bps creator + 30 bps protocol + 10 bps spread.
    expect(Number(received) / 1e18).toBeGreaterThan(9.9);
  });

  test("sells 2 MAG7 shares back to USDC: approve + router.sell at the quoted price", async ({ page, wallet }) => {
    const usdBefore = await usdcBalance(wallet.address);
    const sharesBefore = await shareBalance(mag7, wallet.address);
    const quoted = await quoteSell(mag7, WAD(2));
    await openBasket(page, mag7);
    await connect(page);
    await trade(page, "Sell", "MAG7", "2");
    await wallet.settle();
    expect(sharesBefore - (await shareBalance(mag7, wallet.address))).toBe(WAD(2));
    expect(pctDiff((await usdcBalance(wallet.address)) - usdBefore, quoted)).toBeLessThan(0.001);
    expect(wallet.records.at(-1)!.label).toBe("sell");
  });

  test("redeems 1 share in kind: every constituent lands in the wallet", async ({ page, wallet }) => {
    const expected = await publicClient.readContract({ address: mag7, abi: vaultAbi, functionName: "previewRedeem", args: [WAD(1)] });
    const before = await stockBalances(mag7, wallet.address);
    await openBasket(page, mag7);
    await connect(page);
    await trade(page, "Redeem", "MAG7", "1");
    await wallet.settle();
    const after = await stockBalances(mag7, wallet.address);
    Object.keys(before).forEach((token, i) => {
      expect(after[token as Address] - before[token as Address]).toBe(expected[i]);
    });
    expect(wallet.records.at(-1)!.label).toBe("redeem");
  });

  test("deposits 0.5 share in kind: approves each constituent then vault.mint", async ({ page, wallet }) => {
    const need = await publicClient.readContract({ address: mag7, abi: vaultAbi, functionName: "previewMint", args: [WAD(0.5)] });
    const sharesBefore = await shareBalance(mag7, wallet.address);
    const stocksBefore = await stockBalances(mag7, wallet.address);
    await openBasket(page, mag7);
    await connect(page);
    await trade(page, "Deposit", "MAG7", "0.5");
    await wallet.settle();
    expect((await shareBalance(mag7, wallet.address)) - sharesBefore).toBe(WAD(0.5));
    const stocksAfter = await stockBalances(mag7, wallet.address);
    Object.keys(stocksBefore).forEach((token, i) => {
      expect(stocksBefore[token as Address] - stocksAfter[token as Address]).toBe(need[i]);
    });
    expect(wallet.records.at(-1)!.label).toBe("mint");
  });

  test("guards: insufficient USDC, share balance and constituents block the trade", async ({ page, wallet }) => {
    const failuresBefore = wallet.failures.length;
    const sentBefore = wallet.records.length;
    await openBasket(page, mag7);
    await connect(page);
    await fillAmount(page, "Buy", "MAG7", "100000000");
    await expect(cta(page)).toHaveText("Insufficient USDC");
    await expect(cta(page)).toBeDisabled();

    await setMode(page, "Sell");
    await fillAmount(page, "Sell", "MAG7", "1000000");
    await expect(cta(page)).toHaveText(/Above your .* share balance/);
    await expect(cta(page)).toBeDisabled();

    await setMode(page, "Deposit");
    await fillAmount(page, "Deposit", "MAG7", "500");
    await expect(cta(page)).toHaveText(/Wallet assets cover up to|don't hold/);
    await expect(cta(page)).toBeDisabled();

    await setMode(page, "Buy");
    await fillAmount(page, "Buy", "MAG7", "0");
    await expect(cta(page)).toHaveText("Enter an amount");
    expect(wallet.failures.length).toBe(failuresBefore);
    expect(wallet.records.length).toBe(sentBefore);
  });

  test("rejecting in the wallet shows an error and sends nothing", async ({ page, wallet }) => {
    const sent = wallet.records.length;
    await openBasket(page, mag7);
    await connect(page);
    await setMode(page, "Buy");
    await fillAmount(page, "Buy", "MAG7", "10");
    await page.getByRole("button", { name: "Review buy" }).click();
    wallet.rejectNext();
    await page.getByRole("button", { name: "Confirm", exact: true }).click();
    await expect(page.locator("p.status")).toContainText("Rejected in wallet.", { timeout: 30_000 });
    expect(wallet.records.length).toBe(sent);
  });

  test("wrong network: the app switches to Monad Testnet before sending", async ({ page, wallet }) => {
    const sharesBefore = await shareBalance(mag7, wallet.address);
    await openBasket(page, mag7);
    await connect(page);
    await wallet.setChainId(1);
    await trade(page, "Buy", "MAG7", "20");
    await wallet.settle();
    expect(await shareBalance(mag7, wallet.address)).toBeGreaterThan(sharesBefore);
  });

  test("creates a basket through BasketFactory and lands on its page", async ({ page, wallet }) => {
    const countBefore = await basketCount();
    await page.goto("/create");
    await connect(page);
    await page.getByRole("button", { name: "Select at least two basket assets" }).click();
    for (const sym of ["AAPL", "NVDA", "COIN"]) {
      await page.getByRole("combobox", { name: "Search assets" }).fill(sym);
      await page.getByRole("option", { name: new RegExp(`^${sym}\\b`) }).first().click();
    }
    await page.keyboard.press("Escape");
    await page.getByPlaceholder("AI Leaders").fill("E2E Test Basket");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByPlaceholder("AI4").fill(ticker);
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("textbox", { name: "Starting NAV in USD" }).fill("50");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("button", { name: "Confirm basket" }).click();

    await page.waitForURL(/\/basket\/0x[0-9a-fA-F]{40}/, { timeout: 120_000 });
    created = page.url().split("/basket/")[1].split(/[?#]/)[0] as Address;
    expect(await basketCount()).toBe(countBefore + BigInt(1));
    const b = await getBasket(created);
    expect(b.symbol).toBe(ticker);
    expect(b.name).toBe("E2E Test Basket");
    expect(b.owner.toLowerCase()).toBe(wallet.address.toLowerCase());
    expect(b.legs.map((l) => l.symbol).sort()).toEqual(["AAPL", "COIN", "NVDA"]);
    expect(Math.abs(Number(b.nav) / 1e18 - 50)).toBeLessThan(0.01);
    for (const leg of b.legs) expect(Math.abs(Number(leg.weightBps) - 3333)).toBeLessThanOrEqual(2);
    await expect(page.getByRole("heading", { name: "E2E Test Basket" })).toBeVisible({ timeout: 30_000 });
  });

  test("buys the new basket", async ({ page, wallet }) => {
    test.skip(!created, "basket creation failed");
    const quoted = await quoteBuy(created!, USDC(250));
    await openBasket(page, created!);
    await connect(page);
    await trade(page, "Buy", ticker, "250");
    await wallet.settle();
    expect(pctDiff(await shareBalance(created!, wallet.address), quoted)).toBeLessThan(0.001);
  });

  test("portfolio lists every position with its on-chain value", async ({ page, wallet }) => {
    const held = await holdings(wallet.address);
    expect(held.length).toBeGreaterThanOrEqual(created ? 2 : 1);
    await page.goto("/portfolio");
    await connect(page);
    for (const h of held) await expect(page.getByText(h.symbol, { exact: true }).first()).toBeVisible({ timeout: 30_000 });
    const total = held.reduce((s, h) => s + Number(h.value) / 1e18, 0);
    const shown = total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    await expect(page.getByText(`$${shown}`).first()).toBeVisible();
  });

  test("leaderboard shows the new creator", async ({ page, wallet }) => {
    test.skip(!created, "basket creation failed");
    await page.goto("/leaderboard");
    const a = wallet.address.toLowerCase();
    await expect(page.getByText(new RegExp(`${a.slice(0, 6)}(…|\\.\\.\\.)${a.slice(-4)}`, "i")).first()).toBeVisible({
      timeout: 30_000,
    });
  });
});
