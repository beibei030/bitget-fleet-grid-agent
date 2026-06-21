/**
 * 舰队网格回测引擎 — 对齐 VPS Decibel 参数：
 * - 22 格 / ±2.4% 半宽 / 5x 杠杆 / 自动重挂
 */
import { buildGrid, priceBand, type GridSpec } from "./gridCore.js";
import type { CandleBar } from "./bitgetPublicApi.js";

/** 与 server/src/grid/fleetPlan.ts DEC_CRYPTO_GRID 一致 */
export const FLEET_GRID = {
  leverage: 5,
  gridCount: 22,
  rangeHalfPct: 0.024,
  budgetUse: 0.85,
  skipBand: 0.1,
  autoRecenter: true,
  recenterCooldownBars: 30,
  makerFeeRate: 0.0002,
};

export interface TradeLogEntry {
  ts: number;
  iso: string;
  symbol: string;
  side: "buy" | "sell";
  price: number;
  size: number;
  notional: number;
  fee: number;
  pnl: number;
  balance: number;
  position: number;
  event: "fill" | "recenter" | "range_break";
}

export interface FleetBacktestParams {
  symbol: string;
  balanceUsd: number;
  leverage: number;
  gridCount: number;
  rangeHalfPct: number;
  budgetUse: number;
  makerFeeRate: number;
  funding8h: number;
  autoRecenter: boolean;
  recenterCooldownBars: number;
  maxFunding8h: number;
  gridMode?: import("./trendAnalyzer.js").GridMode;
}

export interface FleetBacktestResult {
  symbol: string;
  params: FleetBacktestParams;
  days: number;
  bars: number;
  roundTrips: number;
  volumeUsd: number;
  grossPnl: number;
  fees: number;
  fundingCost: number;
  netPnl: number;
  maxDrawdown: number;
  recenterCount: number;
  rangeBreakCount: number;
  finalBalance: number;
  returnPct: number;
  sharpe: number;
  trades: TradeLogEntry[];
}

interface PendingSell {
  buyPrice: number;
  sellPrice: number;
  size: number;
}

export function simulateFleetGrid(bars: CandleBar[], raw: Partial<FleetBacktestParams>): FleetBacktestResult {
  const params: FleetBacktestParams = {
    symbol: raw.symbol ?? "SOLUSDT",
    balanceUsd: raw.balanceUsd ?? 1000,
    leverage: raw.leverage ?? FLEET_GRID.leverage,
    gridCount: raw.gridCount ?? FLEET_GRID.gridCount,
    rangeHalfPct: raw.rangeHalfPct ?? FLEET_GRID.rangeHalfPct,
    budgetUse: raw.budgetUse ?? FLEET_GRID.budgetUse,
    makerFeeRate: raw.makerFeeRate ?? FLEET_GRID.makerFeeRate,
    funding8h: raw.funding8h ?? 0.0001,
    autoRecenter: raw.autoRecenter ?? FLEET_GRID.autoRecenter,
    recenterCooldownBars: raw.recenterCooldownBars ?? FLEET_GRID.recenterCooldownBars,
    maxFunding8h: raw.maxFunding8h ?? 0.00025,
    gridMode: raw.gridMode ?? "neutral",
  };

  if (params.gridMode === "flat" || bars.length < 10) {
    return emptyResult(params, bars.length);
  }

  const gridMode = params.gridMode ?? "neutral";
  let center = bars[0].close;
  let { lower, upper } = priceBand(center, params.rangeHalfPct);
  let grid: GridSpec = buildGrid({ lower, upper, gridCount: params.gridCount });
  let step = grid.spacing;

  const slice = params.balanceUsd;
  const notional = slice * params.leverage * params.budgetUse;
  let sizeBase = notional / params.gridCount / center;
  sizeBase = Math.max(sizeBase, 0.001);
  const maxInventoryUsd = notional * 0.6;

  let cash = params.balanceUsd;
  let position = 0;
  let avgEntry = 0;
  let pendingSells: PendingSell[] = [];
  const openBuys = new Set<number>();

  let fees = 0;
  let fundingCost = 0;
  let volume = 0;
  let roundTrips = 0;
  let recenterCount = 0;
  let rangeBreakCount = 0;
  let lastRecenterBar = -999;
  const trades: TradeLogEntry[] = [];

  let peakEquity = cash;
  let maxDrawdown = 0;
  const barReturns: number[] = [];
  let prevEquity = cash;

  const seedBuys = (price: number) => {
    openBuys.clear();
    for (const lvl of grid.levels) {
      if (lvl >= price * (1 - params.rangeHalfPct * FLEET_GRID.skipBand)) continue;
      if (lvl < lower) continue;
      openBuys.add(lvl);
    }
  };

  seedBuys(center);

  for (let i = 0; i < bars.length; i++) {
    const b = bars[i];

    const outOfRange = b.close < lower || b.close > upper;
    if (outOfRange) {
      rangeBreakCount++;
      if (params.autoRecenter && i - lastRecenterBar >= params.recenterCooldownBars) {
        center = b.close;
        ({ lower, upper } = priceBand(center, params.rangeHalfPct));
        grid = buildGrid({ lower, upper, gridCount: params.gridCount });
        step = grid.spacing;
        sizeBase = notional / params.gridCount / center;
        pendingSells = pendingSells.filter((p) => p.sellPrice <= upper && p.sellPrice >= lower);
        seedBuys(center);
        lastRecenterBar = i;
        recenterCount++;
        trades.push(logTrade(b.ts, params.symbol, "buy", center, 0, 0, 0, cash, position, "recenter"));
      }
    }

    const allowBuys = params.funding8h <= params.maxFunding8h && (gridMode === "neutral" || gridMode === "long");

    for (const buyPx of [...openBuys].sort((a, c) => c - a)) {
      if (!allowBuys) break;
      if (b.low > buyPx) continue;
      if (position * buyPx + sizeBase * buyPx > maxInventoryUsd) continue;
      const fee = buyPx * sizeBase * params.makerFeeRate;
      const cost = buyPx * sizeBase + fee;
      if (cash < cost) continue;

      cash -= cost;
      fees += fee;
      volume += buyPx * sizeBase;
      const newPos = position + sizeBase;
      avgEntry = position > 0 ? (avgEntry * position + buyPx * sizeBase) / newPos : buyPx;
      position = newPos;
      openBuys.delete(buyPx);

      const sellPx = roundTick(buyPx + step);
      pendingSells.push({ buyPrice: buyPx, sellPrice: sellPx, size: sizeBase });
      trades.push(logTrade(b.ts, params.symbol, "buy", buyPx, sizeBase, fee, 0, cash, position, "fill"));

      const nextBuy = roundTick(buyPx - step);
      if (nextBuy >= lower) openBuys.add(nextBuy);
    }

    for (const lot of [...pendingSells]) {
      if (gridMode === "short") continue;
      if (b.high < lot.sellPrice) continue;
      const fee = lot.sellPrice * lot.size * params.makerFeeRate;
      const pnl = lot.size * (lot.sellPrice - lot.buyPrice) - fee * 2;
      cash += lot.sellPrice * lot.size - fee;
      fees += fee;
      volume += lot.sellPrice * lot.size;
      position -= lot.size;
      if (position <= 1e-9) {
        position = 0;
        avgEntry = 0;
      }
      roundTrips++;
      pendingSells = pendingSells.filter((x) => x !== lot);
      trades.push(logTrade(b.ts, params.symbol, "sell", lot.sellPrice, lot.size, fee, pnl, cash, position, "fill"));

      openBuys.add(lot.buyPrice);
    }

    if (position > 0 && params.funding8h > 0) {
      const fc = position * b.close * (params.funding8h / 8);
      fundingCost += fc;
      cash -= fc;
    }

    const unrealized = position > 0 ? position * (b.close - avgEntry) : 0;
    const equity = cash + unrealized;
    peakEquity = Math.max(peakEquity, equity);
    maxDrawdown = Math.max(maxDrawdown, peakEquity - equity);
    barReturns.push((equity - prevEquity) / Math.max(prevEquity, 1));
    prevEquity = equity;
  }

  if (position > 0) {
    const last = bars[bars.length - 1].close;
    cash += position * last;
    volume += position * last;
    position = 0;
  }

  const netPnl = cash - params.balanceUsd;
  const days = Math.max(1, bars.length / 24);
  const mean = barReturns.reduce((a, x) => a + x, 0) / Math.max(barReturns.length, 1);
  const std = Math.sqrt(barReturns.reduce((a, x) => a + (x - mean) ** 2, 0) / Math.max(barReturns.length, 1));
  const sharpe = std > 0 ? (mean / std) * Math.sqrt(24 * 365) : 0;

  return {
    symbol: params.symbol,
    params,
    days,
    bars: bars.length,
    roundTrips,
    volumeUsd: volume,
    grossPnl: netPnl + fees + fundingCost,
    fees,
    fundingCost,
    netPnl,
    maxDrawdown,
    recenterCount,
    rangeBreakCount,
    finalBalance: cash,
    returnPct: (netPnl / params.balanceUsd) * 100,
    sharpe,
    trades,
  };
}

function roundTick(p: number) {
  return Math.round(p * 100) / 100;
}

function logTrade(
  ts: number,
  symbol: string,
  side: "buy" | "sell",
  price: number,
  size: number,
  fee: number,
  pnl: number,
  balance: number,
  position: number,
  event: TradeLogEntry["event"]
): TradeLogEntry {
  return {
    ts,
    iso: new Date(ts).toISOString(),
    symbol,
    side,
    price,
    size,
    notional: price * size,
    fee,
    pnl,
    balance,
    position,
    event,
  };
}

function emptyResult(params: FleetBacktestParams, n: number): FleetBacktestResult {
  return {
    symbol: params.symbol,
    params,
    days: 0,
    bars: n,
    roundTrips: 0,
    volumeUsd: 0,
    grossPnl: 0,
    fees: 0,
    fundingCost: 0,
    netPnl: 0,
    maxDrawdown: 0,
    recenterCount: 0,
    rangeBreakCount: 0,
    finalBalance: params.balanceUsd,
    returnPct: 0,
    sharpe: 0,
    trades: [],
  };
}

export function formatReport(results: FleetBacktestResult[]): string {
  const lines = [
    "# Bitget 自适应舰队网格 — 回测报告",
    "",
    `生成时间：${new Date().toISOString()}`,
    "",
    "## 策略参数（源自 VPS Decibel 实盘）",
    "",
    "| 参数 | 值 |",
    "| --- | --- |",
    `| 模式 | 中性等差网格 |`,
    `| 格数 | ${FLEET_GRID.gridCount} |`,
    `| 半宽 | ±${(FLEET_GRID.rangeHalfPct * 100).toFixed(1)}% |`,
    `| 杠杆 | ${FLEET_GRID.leverage}x |`,
    `| 预算利用率 | ${(FLEET_GRID.budgetUse * 100).toFixed(0)}% |`,
    `| 自动重挂 | ${FLEET_GRID.autoRecenter ? "是" : "否"} |`,
    `| Maker 费率 | ${(FLEET_GRID.makerFeeRate * 100).toFixed(2)}% |`,
    "",
    "## 分标的回测结果",
    "",
    "| 标的 | 天数 | 净利 USDT | 收益率 | 完整格数 | 成交量 | 最大回撤 | 重挂次数 | 夏普 |",
    "| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
  ];

  for (const r of results) {
    lines.push(
      `| ${r.symbol} | ${r.days.toFixed(0)} | ${r.netPnl.toFixed(2)} | ${r.returnPct.toFixed(2)}% | ${r.roundTrips} | ${r.volumeUsd.toFixed(0)} | ${r.maxDrawdown.toFixed(2)} | ${r.recenterCount} | ${r.sharpe.toFixed(2)} |`
    );
  }

  const totalPnl = results.reduce((a, r) => a + r.netPnl, 0);
  const totalVol = results.reduce((a, r) => a + r.volumeUsd, 0);
  lines.push("", "## 组合汇总", "", `- 组合净利：**${totalPnl.toFixed(2)} USDT**`, `- 组合成交量：**${totalVol.toFixed(0)} USDT**`, "");
  lines.push("## 复现方式", "", "```bash", "npm install", "npm run backtest", "npm run paper", "```", "");
  return lines.join("\n");
}
