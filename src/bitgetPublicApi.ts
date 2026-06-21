/** Bitget 公开行情 API（回测 / paper trading 无需 API Key） */

export interface CandleBar {
  ts: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

const BASE = "https://api.bitget.com";

async function getJson<T>(path: string, retries = 5): Promise<T> {
  for (let i = 0; i <= retries; i++) {
    const res = await fetch(`${BASE}${path}`);
    if (res.status === 429) {
      await sleep(800 * (i + 1));
      continue;
    }
    if (!res.ok) throw new Error(`Bitget HTTP ${res.status}: ${path}`);
    const body = (await res.json()) as { code: string; msg: string; data: T };
    if (body.code !== "00000") throw new Error(`Bitget API ${body.code}: ${body.msg}`);
    return body.data;
  }
  throw new Error(`Bitget rate limit: ${path}`);
}

/** 拉取 USDT 永续 K 线（最多 90 天窗口，分页拼接） */
export async function fetchFuturesCandles(
  symbol: string,
  granularity: "1H" | "4H" | "1D" = "1H",
  days = 30
): Promise<CandleBar[]> {
  const end = Date.now();
  const start = end - days * 86400000;

  const parse = (chunk: string[][]) =>
    chunk
      .map((row) => ({
        ts: Number(row[0]),
        open: Number(row[1]),
        high: Number(row[2]),
        low: Number(row[3]),
        close: Number(row[4]),
        volume: Number(row[5]),
      }))
      .filter((b) => b.ts >= start && b.ts <= end);

  // 单次请求通常足够（30d × 1H ≈ 720 根）
  const single = await getJson<string[][]>(
    `/api/v2/mix/market/candles?symbol=${symbol}&granularity=${granularity}&limit=1000&productType=USDT-FUTURES&startTime=${start}&endTime=${end}`
  );
  const first = parse(single);
  if (first.length >= days * 20) {
    const dedup = new Map<number, CandleBar>();
    for (const b of first) dedup.set(b.ts, b);
    return [...dedup.values()].sort((a, b) => a.ts - b.ts);
  }

  const out: CandleBar[] = [...first];
  let cursorEnd = first.length ? first[0].ts - 1 : end;

  while (cursorEnd > start) {
    await sleep(600);
    const chunk = await getJson<string[][]>(
      `/api/v2/mix/market/history-candles?symbol=${symbol}&granularity=${granularity}&limit=200&productType=USDT-FUTURES&endTime=${cursorEnd}`
    );
    if (!chunk.length) break;
    out.push(...parse(chunk));
    const oldest = Number(chunk[chunk.length - 1][0]);
    if (oldest <= start || chunk.length < 2) break;
    cursorEnd = oldest - 1;
  }

  const dedup = new Map<number, CandleBar>();
  for (const b of out) dedup.set(b.ts, b);
  return [...dedup.values()].sort((a, b) => a.ts - b.ts);
}

export async function fetchTicker(symbol: string): Promise<{ last: number; fundingRate?: number }> {
  const rows = await getJson<{ lastPr: string; fundingRate?: string }[]>(
    `/api/v2/mix/market/ticker?symbol=${symbol}&productType=USDT-FUTURES`
  );
  const t = rows[0];
  if (!t) throw new Error(`无 ticker: ${symbol}`);
  return {
    last: Number(t.lastPr),
    fundingRate: t.fundingRate != null ? Number(t.fundingRate) : undefined,
  };
}

export async function fetchContract(symbol: string): Promise<{ minSize: number; priceStep: number }> {
  const rows = await getJson<{ minTradeNum: string; pricePlace: string }[]>(
    `/api/v2/mix/market/contracts?productType=USDT-FUTURES&symbol=${symbol}`
  );
  const c = rows.find((x) => true);
  if (!c) return { minSize: 0.01, priceStep: 0.01 };
  const decimals = Number(c.pricePlace);
  return {
    minSize: Number(c.minTradeNum),
    priceStep: decimals > 0 ? 10 ** -decimals : 0.01,
  };
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}
