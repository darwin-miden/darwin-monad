import { encodeFunctionData } from "viem";
import { deployment, skipFaucetCooldown, testUsdAbi, usdcBalance } from "./chain";
import { IS_FORK } from "./env";
import { expect, test } from "./wallet";

type Eip1193 = { request: (args: { method: string; params?: unknown[] }) => Promise<unknown> };

test.describe("harness", () => {
  test("injected provider answers like a wallet", async ({ page, wallet }) => {
    await page.goto("/");
    expect(await page.evaluate(() => typeof (window as unknown as { ethereum?: unknown }).ethereum)).toBe("object");
    expect(await page.evaluate(() => (window as unknown as { ethereum: Eip1193 }).ethereum.request({ method: "eth_chainId" }))).toBe(
      "0x279f",
    );
    expect(await page.evaluate(() => (window as unknown as { ethereum: Eip1193 }).ethereum.request({ method: "eth_accounts" }))).toEqual([]);
    const accounts = await page.evaluate(() =>
      (window as unknown as { ethereum: Eip1193 }).ethereum.request({ method: "eth_requestAccounts" }),
    );
    expect(accounts).toEqual([wallet.address.toLowerCase()]);
    // Plain reads are forwarded to the node.
    const block = await page.evaluate(() => (window as unknown as { ethereum: Eip1193 }).ethereum.request({ method: "eth_blockNumber" }));
    expect(String(block)).toMatch(/^0x[0-9a-f]+$/);
  });

  test("rejections surface as EIP-1193 errors", async ({ page, wallet }) => {
    await page.goto("/");
    wallet.rejectNext();
    const err = await page.evaluate(async (from) => {
      try {
        await (window as unknown as { ethereum: Eip1193 }).ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from, to: from, value: "0x0" }],
        });
        return null;
      } catch (e) {
        return { code: (e as { code: number }).code, message: (e as Error).message };
      }
    }, wallet.address);
    expect(err).toEqual({ code: 4001, message: "User rejected the request." });
  });

  test("sends a self transfer from the page (fork)", async ({ page, wallet }) => {
    test.skip(!IS_FORK, "spends gas");
    await page.goto("/");
    const hash = await page.evaluate(
      (from) =>
        (window as unknown as { ethereum: Eip1193 }).ethereum.request({
          method: "eth_sendTransaction",
          params: [{ from, to: from, value: "0x0" }],
        }),
      wallet.address,
    );
    expect(String(hash)).toMatch(/^0x[0-9a-f]{64}$/);
    const tx = await wallet.waitForTx();
    expect(tx.hash).toBe(hash);
    expect(tx.status).toBe("success");
    expect(tx.label).toBe("native transfer");
  });

  test("claims the USDC faucet from the page (fork)", async ({ page, wallet }) => {
    test.skip(!IS_FORK, "faucet has a 1h cooldown on the live chain");
    await skipFaucetCooldown(wallet.address);
    const before = await usdcBalance(wallet.address);
    await page.goto("/");
    await page.evaluate(
      ([from, to, data]) =>
        (window as unknown as { ethereum: Eip1193 }).ethereum.request({ method: "eth_sendTransaction", params: [{ from, to, data }] }),
      [wallet.address, deployment.usd, encodeFunctionData({ abi: testUsdAbi, functionName: "faucet" })] as const,
    );
    const tx = await wallet.waitForTx();
    expect(tx.status).toBe("success");
    expect(tx.label).toBe("faucet");
    expect((await usdcBalance(wallet.address)) - before).toBe(BigInt(10_000) * BigInt(1_000_000));
  });
});
