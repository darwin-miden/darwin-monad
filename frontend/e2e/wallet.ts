import fs from "node:fs";
import path from "node:path";
import { test as base, expect, type Page } from "@playwright/test";
import {
  BaseError,
  createWalletClient,
  decodeFunctionData,
  formatEther,
  http,
  nonceManager,
  type Address,
  type Chain,
  type Hex,
  type PrivateKeyAccount,
  type TransactionReceipt,
  type Transport,
  type WalletClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { chain, fund, nativeBalance, publicClient, writeAbis } from "./chain";
import { IS_FORK, RESULTS_DIR, RPC_URL, TARGET, privateKey } from "./env";

// ------------------------------------------------------------------ types

type RpcError = { code: number; message: string; data?: unknown };
type RpcResponse = { result?: unknown; error?: RpcError };

type TxParams = {
  from?: string;
  to?: string;
  data?: Hex;
  input?: Hex;
  value?: Hex;
  gas?: Hex;
  gasPrice?: Hex;
  maxFeePerGas?: Hex;
  maxPriorityFeePerGas?: Hex;
  nonce?: Hex;
};

export type TxRecord = {
  target: string;
  test: string | null;
  label: string;
  hash: Hex;
  from: Address;
  to: Address | null;
  status: "success" | "reverted";
  gasLimit: string;
  gasUsed: string;
  /** Gas used / gas limit: how tight the estimate was. */
  gasEfficiency: number;
  effectiveGasPrice: string;
  /** What the sender actually paid on Monad: the full gas limit is billed. */
  costMon: string;
  blockNumber: string;
  sentAt: string;
  confirmedMs: number;
  receipt: TransactionReceipt;
};

export type FailedSend = { target: string; test: string | null; label: string; error: RpcError; at: string };

// ------------------------------------------------------------------ recording

const resultsFile = path.join(RESULTS_DIR, `txs-${TARGET}.json`);
const failuresFile = path.join(RESULTS_DIR, `failed-sends-${TARGET}.json`);

function append(file: string, entry: unknown) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const list = fs.existsSync(file) ? (JSON.parse(fs.readFileSync(file, "utf8")) as unknown[]) : [];
  list.push(entry);
  fs.writeFileSync(file, JSON.stringify(list, (_, v) => (typeof v === "bigint" ? v.toString() : v), 2));
}

export function resetResults() {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(resultsFile, "[]");
  fs.writeFileSync(failuresFile, "[]");
}

function toRpcError(e: unknown): RpcError {
  let code = -32603;
  let data: unknown;
  if (e instanceof BaseError) {
    e.walk((inner) => {
      const c = (inner as { code?: unknown }).code;
      if (typeof c === "number" && code === -32603) code = c;
      const d = (inner as { data?: unknown }).data;
      if (d !== undefined && data === undefined) data = d;
      return false;
    });
    return { code, message: e.shortMessage || e.message, data };
  }
  const err = e as { code?: number; message?: string };
  return { code: typeof err?.code === "number" ? err.code : code, message: err?.message ?? String(e) };
}

function describeCall(to: string | undefined, data: Hex | undefined): string {
  if (!to) return "contract creation";
  if (!data || data === "0x") return "native transfer";
  try {
    const { functionName } = decodeFunctionData({ abi: writeAbis, data });
    return functionName;
  } catch {
    return data.slice(0, 10);
  }
}

const hexToBig = (v: Hex | undefined) => (v === undefined ? undefined : BigInt(v));

// ------------------------------------------------------------------ wallet

/**
 * Node-side signer behind the page's injected `window.ethereum`.
 * The private key stays in this process; the page only sees EIP-1193 requests and responses.
 */
export class E2EWallet {
  readonly account: PrivateKeyAccount;
  readonly address: Address;
  readonly walletClient: WalletClient<Transport, Chain, PrivateKeyAccount>;
  readonly records: TxRecord[] = [];
  readonly failures: FailedSend[] = [];

  testTitle: string | null = null;
  /** Mirrors a real wallet: eth_accounts is empty until the site asked for access. */
  authorized = false;
  private page: Page | null = null;
  private nextLabel: string | null = null;
  private rejectNextSend = false;
  private chainIdOverride: number | null = null;
  private sent: Promise<TxRecord>[] = [];
  private cursor = 0;
  private waiters: ((p: Promise<TxRecord>) => void)[] = [];

  constructor(key: Hex = privateKey()) {
    this.account = privateKeyToAccount(key, { nonceManager });
    this.address = this.account.address;
    this.walletClient = createWalletClient({ account: this.account, chain, transport: http(RPC_URL, { retryCount: 2 }) });
  }

  attach(page: Page) {
    this.page = page;
  }

  // ---------------------------------------------------------------- controls for specs

  /** Label the next transaction in the results file (defaults to the decoded function name). */
  label(name: string) {
    this.nextLabel = name;
    return this;
  }

  /** Make the next eth_sendTransaction fail as if the user clicked "Reject" (EIP-1193 code 4001). */
  rejectNext() {
    this.rejectNextSend = true;
  }

  /** Report another chain id to the page (to exercise "switch network" UI). Pass null to restore. */
  async setChainId(id: number | null) {
    this.chainIdOverride = id;
    await this.emit("chainChanged", `0x${(await this.chainId()).toString(16)}`);
  }

  /** Emits an EIP-1193 event on the page's provider. */
  async emit(event: string, payload: unknown) {
    await this.page?.evaluate(
      ([ev, p]) => (window as unknown as { ethereum: { __emit: (e: string, x: unknown) => void } }).ethereum.__emit(ev, p),
      [event, payload] as const,
    );
  }

  /**
   * Resolves with the confirmed record of the next transaction not yet consumed by a previous call,
   * waiting for the app to send it if needed.
   */
  async waitForTx(timeoutMs = 120_000): Promise<TxRecord> {
    let pending: Promise<TxRecord>;
    if (this.cursor < this.sent.length) {
      pending = this.sent[this.cursor];
    } else {
      // Wrapped so awaiting the waiter does not also await the receipt.
      const next = await new Promise<{ receipt: Promise<TxRecord> }>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`no transaction sent within ${timeoutMs}ms`)), timeoutMs);
        this.waiters.push((p) => {
          clearTimeout(timer);
          resolve({ receipt: p });
        });
      });
      pending = next.receipt;
    }
    this.cursor += 1;
    return pending;
  }

  /** Waits for `n` transactions in order (e.g. approve + buy). */
  async waitForTxs(n: number, timeoutMs = 120_000): Promise<TxRecord[]> {
    const out: TxRecord[] = [];
    for (let i = 0; i < n; i += 1) out.push(await this.waitForTx(timeoutMs));
    return out;
  }

  /** Waits for every transaction sent so far and returns all records. */
  async settle(): Promise<TxRecord[]> {
    await Promise.all(this.sent);
    this.cursor = this.sent.length;
    return this.records;
  }

  get lastReceipt(): TransactionReceipt | undefined {
    return this.records.at(-1)?.receipt;
  }

  /** Transactions sent but not yet consumed by waitForTx. */
  get unconsumed() {
    return this.sent.length - this.cursor;
  }

  // ---------------------------------------------------------------- EIP-1193

  private async chainId() {
    return this.chainIdOverride ?? (await publicClient.getChainId());
  }

  async handle(method: string, params: unknown[]): Promise<unknown> {
    switch (method) {
      case "eth_requestAccounts":
      case "wallet_requestPermissions": {
        const first = !this.authorized;
        this.authorized = true;
        // Wallets return lowercase addresses; keep that so the app's own normalisation is exercised.
        if (first) void this.emit("accountsChanged", [this.address.toLowerCase()]);
        return method === "eth_requestAccounts" ? [this.address.toLowerCase()] : [{ parentCapability: "eth_accounts" }];
      }
      case "eth_accounts":
        return this.authorized ? [this.address.toLowerCase()] : [];
      case "eth_chainId":
        return `0x${(await this.chainId()).toString(16)}`;
      case "net_version":
        return String(await this.chainId());
      case "wallet_switchEthereumChain": {
        const wanted = Number((params[0] as { chainId: string }).chainId);
        const real = await publicClient.getChainId();
        if (wanted !== real) throw { code: 4902, message: `Unrecognized chain ID ${wanted}` } satisfies RpcError;
        this.chainIdOverride = null;
        void this.emit("chainChanged", `0x${real.toString(16)}`);
        return null;
      }
      case "wallet_addEthereumChain":
        return null;
      case "wallet_getPermissions":
        return this.authorized ? [{ parentCapability: "eth_accounts" }] : [];
      case "wallet_revokePermissions":
        this.authorized = false;
        return null;
      case "eth_sendTransaction":
        return this.sendTransaction(params[0] as TxParams);
      case "personal_sign": {
        const [message] = params as [Hex];
        return this.account.signMessage({ message: { raw: message } });
      }
      case "eth_signTypedData_v4": {
        const typed = JSON.parse(params[1] as string);
        delete typed.types?.EIP712Domain;
        return this.account.signTypedData(typed);
      }
      default:
        return publicClient.request({ method: method as never, params: params as never });
    }
  }

  private async sendTransaction(tx: TxParams): Promise<Hex> {
    const label = this.nextLabel ?? describeCall(tx.to, tx.data ?? tx.input);
    this.nextLabel = null;
    try {
      if (this.rejectNextSend) {
        this.rejectNextSend = false;
        throw { code: 4001, message: "User rejected the request." } satisfies RpcError;
      }
      if (tx.from && tx.from.toLowerCase() !== this.address.toLowerCase()) {
        throw { code: 4100, message: `Unknown account ${tx.from}` } satisfies RpcError;
      }
      if (this.chainIdOverride !== null) {
        throw { code: 4901, message: "Wallet is connected to another chain" } satisfies RpcError;
      }
      // Anything the dapp did not set (gas, fees, nonce) is filled by viem from the node — no gas multiplier,
      // so an estimate that is too tight on Monad shows up as a reverted/out-of-gas transaction.
      const request = {
        to: tx.to as Address | undefined,
        data: tx.data ?? tx.input,
        value: hexToBig(tx.value),
        gas: hexToBig(tx.gas),
        ...(tx.gasPrice
          ? { gasPrice: hexToBig(tx.gasPrice) }
          : { maxFeePerGas: hexToBig(tx.maxFeePerGas), maxPriorityFeePerGas: hexToBig(tx.maxPriorityFeePerGas) }),
      } as never;
      let hash: Hex;
      try {
        hash = await this.walletClient.sendTransaction(request);
      } catch (e) {
        // A reset fork or another sender moved the nonce under us: resync once and retry.
        if (!/nonce/i.test(String((e as Error)?.message))) throw e;
        nonceManager.reset({ address: this.address, chainId: chain.id });
        hash = await this.walletClient.sendTransaction(request);
      }
      this.track(hash, label);
      return hash;
    } catch (e) {
      const error = (e as RpcError)?.code !== undefined && !(e instanceof Error) ? (e as RpcError) : toRpcError(e);
      const failure: FailedSend = { target: TARGET, test: this.testTitle, label, error, at: new Date().toISOString() };
      this.failures.push(failure);
      append(failuresFile, failure);
      throw error;
    }
  }

  private track(hash: Hex, label: string) {
    const sentAt = Date.now();
    const pending = (async () => {
      const receipt = await publicClient.waitForTransactionReceipt({ hash, timeout: 180_000, pollingInterval: 400 });
      const tx = await publicClient.getTransaction({ hash });
      const record: TxRecord = {
        target: TARGET,
        test: this.testTitle,
        label,
        hash,
        from: receipt.from,
        to: receipt.to,
        status: receipt.status,
        gasLimit: tx.gas.toString(),
        gasUsed: receipt.gasUsed.toString(),
        gasEfficiency: Number(receipt.gasUsed) / Number(tx.gas),
        effectiveGasPrice: receipt.effectiveGasPrice.toString(),
        costMon: formatEther(tx.gas * receipt.effectiveGasPrice),
        blockNumber: receipt.blockNumber.toString(),
        sentAt: new Date(sentAt).toISOString(),
        confirmedMs: Date.now() - sentAt,
        receipt,
      };
      this.records.push(record);
      const { receipt: _omit, ...persisted } = record;
      void _omit;
      append(resultsFile, persisted);
      return record;
    })();
    // Never leave an unobserved rejection behind; waitForTx/settle surface the error.
    pending.catch(() => {});
    this.sent.push(pending);
    for (const w of this.waiters.splice(0)) w(pending);
  }
}

// ------------------------------------------------------------------ page-side provider

/** Runs in the page before any app script. Must be self-contained (serialised by Playwright). */
function installProvider() {
  type Listener = (...args: unknown[]) => void;
  const listeners = new Map<string, Set<Listener>>();
  const bridge = (window as unknown as { __e2eWalletRequest: (payload: string) => Promise<string> }).__e2eWalletRequest;
  const emit = (event: string, ...args: unknown[]) => {
    for (const fn of Array.from(listeners.get(event) ?? [])) {
      try {
        fn(...args);
      } catch (err) {
        console.error(err);
      }
    }
  };
  const provider = {
    isMetaMask: false,
    isE2EWallet: true,
    async request({ method, params }: { method: string; params?: unknown[] | Record<string, unknown> }) {
      const raw = await bridge(JSON.stringify({ method, params: params ?? [] }));
      const res = JSON.parse(raw) as { result?: unknown; error?: { code: number; message: string; data?: unknown } };
      if (res.error) {
        const err = new Error(res.error.message) as Error & { code: number; data?: unknown };
        err.code = res.error.code;
        if (res.error.data !== undefined) err.data = res.error.data;
        throw err;
      }
      return res.result;
    },
    on(event: string, fn: Listener) {
      if (!listeners.has(event)) listeners.set(event, new Set());
      listeners.get(event)!.add(fn);
      return provider;
    },
    removeListener(event: string, fn: Listener) {
      listeners.get(event)?.delete(fn);
      return provider;
    },
    removeAllListeners(event?: string) {
      if (event) listeners.delete(event);
      else listeners.clear();
      return provider;
    },
    enable() {
      return provider.request({ method: "eth_requestAccounts" });
    },
    __emit: emit,
  };
  Object.assign(provider, { addListener: provider.on, off: provider.removeListener, once: provider.on });
  Object.defineProperty(window, "ethereum", { value: provider, configurable: true, writable: true });
  window.dispatchEvent(new Event("ethereum#initialized"));
}

// ------------------------------------------------------------------ fixtures

type Fixtures = { wallet: E2EWallet };
type WorkerFixtures = { walletWorker: E2EWallet };

export const test = base.extend<Fixtures, WorkerFixtures>({
  // One signer per worker so the nonce manager sees every transaction in order.
  walletWorker: [
    async ({}, provide) => {
      await provide(new E2EWallet());
    },
    { scope: "worker" },
  ],
  wallet: async ({ walletWorker }, provide, testInfo) => {
    walletWorker.testTitle = testInfo.titlePath.slice(1).join(" › ");
    walletWorker.authorized = false; // fresh browser context per test = site not yet connected
    if (IS_FORK && (await nativeBalance(walletWorker.address)) < BigInt(10) ** BigInt(19)) await fund(walletWorker.address);
    await provide(walletWorker);
    walletWorker.testTitle = null;
  },
  page: async ({ page, wallet }, provide) => {
    wallet.attach(page);
    await page.exposeFunction("__e2eWalletRequest", async (payload: string): Promise<string> => {
      const { method, params } = JSON.parse(payload) as { method: string; params: unknown[] };
      try {
        const result = await wallet.handle(method, Array.isArray(params) ? params : [params]);
        return JSON.stringify({ result } satisfies RpcResponse, (_, v) => (typeof v === "bigint" ? `0x${v.toString(16)}` : v));
      } catch (e) {
        const error = (e as RpcError)?.code !== undefined && !(e instanceof Error) ? (e as RpcError) : toRpcError(e);
        return JSON.stringify({ error } satisfies RpcResponse);
      }
    });
    await page.addInitScript(installProvider);
    await provide(page);
  },
});

export { expect };
