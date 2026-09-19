import { spawn } from "node:child_process";
import fs from "node:fs";
import { formatEther, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { deployment, fund, nativeBalance, publicClient } from "./chain";
import { FORK_RPC_URL, FORK_UPSTREAM_RPC_URL, IS_FORK, LIVE_MIN_MON, RPC_URL, TARGET, privateKey } from "./env";
import { resetResults } from "./wallet";

async function reachable() {
  try {
    return (await publicClient.getChainId()) > 0;
  } catch {
    return false;
  }
}

async function ensureFork() {
  if (await reachable()) return;
  if (RPC_URL !== FORK_RPC_URL) throw new Error(`fork RPC ${RPC_URL} is not reachable`);
  const out = fs.openSync("/tmp/darwin-e2e-anvil.log", "a");
  spawn("anvil", ["--fork-url", FORK_UPSTREAM_RPC_URL, "--port", "8546", "--silent"], {
    detached: true,
    stdio: ["ignore", out, out],
  }).unref();
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await reachable()) return;
  }
  throw new Error("anvil fork did not come up on 8546 (see /tmp/darwin-e2e-anvil.log)");
}

export default async function globalSetup() {
  resetResults();
  const address = privateKeyToAccount(privateKey()).address;

  if (IS_FORK) {
    await ensureFork();
    await fund(address);
  }

  const chainId = await publicClient.getChainId();
  if (chainId !== deployment.chainId) {
    throw new Error(`RPC ${RPC_URL} is chain ${chainId}, deployment is for chain ${deployment.chainId}`);
  }
  const balance = await nativeBalance(address);
  if (!IS_FORK && balance < parseEther(String(LIVE_MIN_MON))) {
    throw new Error(
      `E2E wallet ${address} has ${formatEther(balance)} MON on Monad testnet; fund it with at least ${LIVE_MIN_MON} MON`,
    );
  }
  console.log(`[e2e] target=${TARGET} rpc=${RPC_URL} wallet=${address} balance=${formatEther(balance)} MON`);
}
