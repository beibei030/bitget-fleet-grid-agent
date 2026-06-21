/** 调用 Bitget Agent Hub CLI（与 MCP 同源 bitget-client / bgc） */
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import path from "node:path";
import { promisify } from "node:util";
import { exec } from "node:child_process";

const execAsync = promisify(exec);
const require = createRequire(import.meta.url);
const BGC_BIN = path.join(path.dirname(require.resolve("bitget-client/package.json")), "dist", "index.js");

export interface BgcResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: { type: string; message: string };
  endpoint?: string;
}

export interface BgcOptions {
  paper?: boolean;
  readOnly?: boolean;
  pretty?: boolean;
}

export async function bgc<T = unknown>(
  module: string,
  tool: string,
  params: Record<string, string | number | boolean | object> = {},
  opts: BgcOptions = {}
): Promise<BgcResult<T>> {
  const args = ["bitget-client"];
  if (opts.paper) args.push("--paper-trading");
  if (opts.readOnly) args.push("--read-only");
  args.push(module, tool);

  for (const [k, v] of Object.entries(params)) {
    if (v === undefined || v === null) continue;
    const val = typeof v === "object" ? JSON.stringify(v) : String(v);
    args.push(`--${k}`, val);
  }

  const raw = await execNpx(args).catch((e: Error & { stdout?: string; stderr?: string }) => {
    const text = (e as any).stdout?.toString?.() || (e as any).stderr?.toString?.() || e.message;
    if (text.includes('"ok":') || text.startsWith("{")) return text;
    throw e;
  });
  try {
    return JSON.parse(raw) as BgcResult<T>;
  } catch {
    throw new Error(`bgc 输出非 JSON: ${raw.slice(0, 300)}`);
  }
}

function execNpx(args: string[]): Promise<string> {
  const cliArgs = args.slice(1); // drop "bitget-client"
  const hasJson = cliArgs.some((a) => a.startsWith("[") || a.startsWith("{"));
  if (hasJson) {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [BGC_BIN, ...cliArgs], {
        shell: false,
        env: process.env,
        stdio: ["ignore", "pipe", "pipe"],
        windowsHide: true,
      });
      let out = "";
      let err = "";
      child.stdout.on("data", (d) => (out += d.toString()));
      child.stderr.on("data", (d) => (err += d.toString()));
      child.on("close", (code) => {
        const text = out.trim() || err.trim();
        if (code !== 0 && !text.startsWith("{")) reject(new Error(err || out || `bgc exit ${code}`));
        else resolve(text);
      });
      child.on("error", reject);
    });
  }
  return execAsync(`node "${BGC_BIN}" ${cliArgs.join(" ")}`, {
    env: process.env,
    maxBuffer: 10 * 1024 * 1024,
    windowsHide: true,
    shell: true,
  }).then(({ stdout, stderr }) => stdout.trim() || stderr.trim());
}

export function hasBitgetCredentials(): boolean {
  return !!(process.env.BITGET_API_KEY && process.env.BITGET_SECRET_KEY && process.env.BITGET_PASSPHRASE);
}

export async function getFuturesTicker(symbol: string) {
  return bgc<{ lastPr: string; fundingRate?: string; markPrice?: string }[]>(
    "futures",
    "futures_get_ticker",
    { productType: "USDT-FUTURES", symbol },
    {}
  );
}

export async function getFuturesBalance(paper = true) {
  return bgc(
    "account",
    "get_account_assets",
    { accountType: "futures", productType: "USDT-FUTURES" },
    { paper }
  );
}

export async function getFuturesPositions(symbol: string, paper = true) {
  return bgc("futures", "futures_get_positions", { productType: "USDT-FUTURES", symbol }, { paper, readOnly: false });
}

export async function getPendingOrders(symbol: string, paper = true) {
  return bgc("futures", "futures_get_orders", { productType: "USDT-FUTURES", symbol }, { paper });
}

export async function setLeverage(symbol: string, leverage: number, paper = true) {
  return bgc(
    "futures",
    "futures_set_leverage",
    { productType: "USDT-FUTURES", symbol, marginCoin: "USDT", leverage: String(leverage) },
    { paper }
  );
}

export interface GridOrderSpec {
  productType: "USDT-FUTURES";
  symbol: string;
  side: "buy" | "sell";
  tradeSide: "open";
  orderType: "limit";
  price: string;
  size: string;
  marginCoin: "USDT";
  force: "post_only";
  clientOid: string;
}

export async function placeGridOrders(orders: GridOrderSpec[], paper = true) {
  const results: BgcResult[] = [];
  for (const order of orders) {
    results.push(await bgc("futures", "futures_place_order", { orders: [order] }, { paper }));
    await sleep(250);
  }
  return { ok: results.every((r) => r.ok !== false), data: results };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function cancelAllOrders(symbol: string, paper = true) {
  return bgc(
    "futures",
    "futures_cancel_orders",
    { productType: "USDT-FUTURES", symbol, marginCoin: "USDT", cancelAll: true },
    { paper }
  );
}
