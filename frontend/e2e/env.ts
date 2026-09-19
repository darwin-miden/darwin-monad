import fs from "node:fs";
import path from "node:path";
import { keccak256, toBytes } from "viem";

/** Which chain the suite runs against: a local anvil fork of Monad testnet, or Monad testnet itself. */
export type Target = "fork" | "live";

export const TARGET: Target = process.env.E2E_TARGET === "live" ? "live" : "fork";
export const IS_FORK = TARGET === "fork";

export const FRONTEND_DIR = path.resolve(__dirname, "..");
export const REPO_DIR = path.resolve(FRONTEND_DIR, "..");
export const RESULTS_DIR = path.join(__dirname, "results");

/**
 * Dedicated fork signer. anvil's dev accounts are public keys that people drain on the live testnet, and a fork
 * inherits that state (account #0 has nonce 469 and ~0 MON there), so the fork uses its own key and tops it up.
 */
const FORK_KEY = keccak256(toBytes("darwin-monad-e2e-fork-wallet"));

export const FORK_RPC_URL = "http://127.0.0.1:8546";
export const LIVE_RPC_URL = "https://testnet-rpc.monad.xyz";
export const FORK_UPSTREAM_RPC_URL = LIVE_RPC_URL;

function readEnvFile(file: string): Record<string, string> {
  if (!fs.existsSync(file)) return {};
  const out: Record<string, string> = {};
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

export const RPC_URL = process.env.E2E_RPC_URL || (IS_FORK ? FORK_RPC_URL : LIVE_RPC_URL);

export function privateKey(): `0x${string}` {
  const key = process.env.E2E_PRIVATE_KEY || (IS_FORK ? FORK_KEY : readEnvFile(path.join(FRONTEND_DIR, ".env.e2e")).E2E_PRIVATE_KEY);
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error("E2E_PRIVATE_KEY missing: set it in the environment or in frontend/.env.e2e");
  }
  return key as `0x${string}`;
}

export const APP_PORT = Number(process.env.E2E_PORT || (IS_FORK ? 3140 : 3141));
export const BASE_URL = `http://localhost:${APP_PORT}`;

/** Live runs refuse to start below this native balance (Monad bills the full gas limit). */
export const LIVE_MIN_MON = Number(process.env.E2E_MIN_MON || "0.3");
