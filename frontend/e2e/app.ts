import type { Page } from "@playwright/test";
import { expect } from "./wallet";

export type Mode = "Buy" | "Sell" | "Deposit" | "Redeem";

const INPUT_LABEL: Record<Mode, (symbol: string) => string> = {
  Buy: () => "Amount of USDC to pay",
  Sell: (s) => `Shares of ${s} to sell`,
  Deposit: (s) => `Shares to mint in ${s}`,
  Redeem: (s) => `Shares to redeem in ${s}`,
};

const DONE: Record<Mode, RegExp> = {
  Buy: /Purchase confirmed/,
  Sell: /Sale confirmed/,
  Deposit: /Deposit confirmed/,
  Redeem: /Redemption confirmed/,
};

/** Connects the injected wallet through the header button. */
export async function connect(page: Page) {
  await page.locator("header").getByRole("button", { name: "Connect wallet" }).click();
  await expect(page.getByRole("button", { name: /Wallet options for/ })).toBeVisible({ timeout: 20_000 });
}

export async function openBasket(page: Page, vault: string) {
  await page.goto(`/basket/${vault}`);
  await expect(page.getByRole("group", { name: "Trade mode" })).toBeVisible({ timeout: 30_000 });
}

export async function setMode(page: Page, mode: Mode) {
  await page.getByRole("group", { name: "Trade mode" }).getByRole("button", { name: mode, exact: true }).click();
}

export async function fillAmount(page: Page, mode: Mode, symbol: string, amount: string) {
  const input = page.getByRole("textbox", { name: INPUT_LABEL[mode](symbol) });
  await input.fill(amount);
  return input;
}

/** The main trade button (Review … or the blocker it shows instead). */
export const cta = (page: Page) => page.locator("[data-trade-mode] button.btn-cta");

/** Fills, reviews and confirms a trade, then waits for the confirmation status. */
export async function trade(page: Page, mode: Mode, symbol: string, amount: string) {
  await setMode(page, mode);
  await fillAmount(page, mode, symbol, amount);
  const review = page.getByRole("button", { name: `Review ${mode.toLowerCase()}` });
  await expect(review).toBeEnabled({ timeout: 30_000 });
  await review.click();
  await page.getByRole("button", { name: "Confirm", exact: true }).click();
  await expect(page.locator("p.status")).toContainText(DONE[mode], { timeout: 120_000 });
}

export const pctDiff = (a: bigint, b: bigint) => (b === BigInt(0) ? Infinity : Math.abs(Number(a - b)) / Number(b));
