#!/usr/bin/env node
/**
 * Starts the app for an E2E target in an isolated copy of the worktree.
 *
 * Next 16 takes an exclusive lock on `.next/dev` per project, so a second `next dev` next to the one you
 * already run is refused, and a `next build` would race your own builds. The app is therefore rsynced to
 * /tmp/darwin-e2e/<target> (node_modules cloned once with APFS copy-on-write) and served from there.
 *
 *   E2E_TARGET=fork|live   which chain (fork injects NEXT_PUBLIC_RPC_URL=http://127.0.0.1:8546)
 *   E2E_SERVER=dev|prod    `next dev` (default) or `next build && next start`
 */
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const frontend = path.resolve(here, "..");
const repo = path.resolve(frontend, "..");

const target = process.env.E2E_TARGET === "live" ? "live" : "fork";
const mode = process.env.E2E_SERVER === "prod" ? "prod" : "dev";
const port = process.env.E2E_PORT || (target === "fork" ? "3140" : "3141");
const forkRpc = "http://127.0.0.1:8546";
const upstreamRpc = "https://testnet-rpc.monad.xyz";

const mirrorRoot = path.join("/tmp", "darwin-e2e", target);
const mirrorFrontend = path.join(mirrorRoot, "frontend");

const log = (...args) => console.log(`[e2e:serve:${target}]`, ...args);

async function rpcChainId(url) {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(3000),
    });
    return (await res.json()).result ?? null;
  } catch {
    return null;
  }
}

/** Starts `anvil --fork-url <monad testnet> --port 8546` detached if nothing answers there. */
export async function ensureFork() {
  if (await rpcChainId(forkRpc)) return;
  log("no fork on 8546, starting anvil");
  const out = fs.openSync("/tmp/darwin-e2e-anvil.log", "a");
  const child = spawn("anvil", ["--fork-url", upstreamRpc, "--port", "8546", "--silent"], {
    detached: true,
    stdio: ["ignore", out, out],
  });
  child.unref();
  for (let i = 0; i < 60; i += 1) {
    await new Promise((r) => setTimeout(r, 500));
    if (await rpcChainId(forkRpc)) return;
  }
  throw new Error("anvil fork did not come up on 8546 (see /tmp/darwin-e2e-anvil.log)");
}

function lockHash() {
  const lock = path.join(frontend, "pnpm-lock.yaml");
  return crypto.createHash("sha256").update(fs.readFileSync(lock)).digest("hex");
}

function mirror() {
  fs.mkdirSync(mirrorRoot, { recursive: true });
  const excludes = [
    ".git",
    "node_modules",
    ".next",
    ".env.e2e",
    "contracts/lib",
    "contracts/out",
    "contracts/cache",
    "frontend/e2e/report",
    "frontend/e2e/results",
    "frontend/e2e/test-results",
  ].flatMap((p) => ["--exclude", p]);
  execFileSync("rsync", ["-a", "--delete", ...excludes, `${repo}/`, `${mirrorRoot}/`], { stdio: "inherit" });

  const stamp = path.join(mirrorFrontend, ".e2e-lock-hash");
  const hash = lockHash();
  const current = fs.existsSync(stamp) ? fs.readFileSync(stamp, "utf8") : "";
  if (current !== hash || !fs.existsSync(path.join(mirrorFrontend, "node_modules"))) {
    log("cloning node_modules (copy-on-write)");
    fs.rmSync(path.join(mirrorFrontend, "node_modules"), { recursive: true, force: true });
    try {
      execFileSync("cp", ["-cR", path.join(frontend, "node_modules"), path.join(mirrorFrontend, "node_modules")]);
    } catch {
      execFileSync("cp", ["-R", path.join(frontend, "node_modules"), path.join(mirrorFrontend, "node_modules")]);
    }
    fs.writeFileSync(stamp, hash);
  }
}

async function main() {
  if (target === "fork") await ensureFork();
  mirror();

  const env = { ...process.env, PORT: port, NEXT_TELEMETRY_DISABLED: "1" };
  if (target === "fork") env.NEXT_PUBLIC_RPC_URL = forkRpc;
  else delete env.NEXT_PUBLIC_RPC_URL;

  const next = path.join(mirrorFrontend, "node_modules", ".bin", "next");
  if (mode === "prod") {
    log("next build");
    execFileSync(next, ["build"], { cwd: mirrorFrontend, env, stdio: "inherit" });
  }
  const args = mode === "prod" ? ["start", "--port", port] : ["dev", "--port", port];
  log(`next ${args.join(" ")} in ${mirrorFrontend}`);
  const child = spawn(next, args, { cwd: mirrorFrontend, env, stdio: "inherit" });
  const stop = () => child.kill("SIGTERM");
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  child.on("exit", (code) => process.exit(code ?? 0));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
