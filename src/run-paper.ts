#!/usr/bin/env node
/** Paper Trading 模拟 — 近 7 天逐笔日志（黑客松提交用） */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFuturesCandles, fetchTicker } from "./bitgetPublicApi.js";
import { FLEET_GRID, simulateFleetGrid, type TradeLogEntry } from "./fleetGridSim.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const LOG_DIR = path.join(ROOT, "logs");

const SYMBOL = process.env.PAPER_SYMBOL ?? "SOLUSDT";
const DAYS = Number(process.env.PAPER_DAYS ?? 7);
const BALANCE = Number(process.env.PAPER_BALANCE ?? 1000);

function toCsv(rows: TradeLogEntry[]): string {
  const header = "timestamp,symbol,side,price,size,notional,fee,pnl,balance,position,event";
  const body = rows
    .filter((r) => r.event === "fill")
    .map((r) =>
      [r.iso, r.symbol, r.side, r.price, r.size, r.notional.toFixed(4), r.fee.toFixed(6), r.pnl.toFixed(4), r.balance.toFixed(2), r.position.toFixed(6), r.event].join(",")
    );
  return [header, ...body].join("\n");
}

async function main() {
  console.log(`Paper Trading 模拟 — ${SYMBOL} / ${DAYS} 天 / ${BALANCE} USDT`);

  const bars = await fetchFuturesCandles(SYMBOL, "1H", DAYS);
  let funding8h = 0.0001;
  try {
    const t = await fetchTicker(SYMBOL);
    if (t.fundingRate != null) funding8h = Math.abs(t.fundingRate);
  } catch {
    /* 忽略 */
  }

  const result = simulateFleetGrid(bars, {
    symbol: SYMBOL,
    balanceUsd: BALANCE,
    funding8h,
  });

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(LOG_DIR, `paper-${SYMBOL}-${stamp}.csv`);
  const jsonPath = path.join(LOG_DIR, `paper-${SYMBOL}-${stamp}.json`);

  fs.writeFileSync(csvPath, toCsv(result.trades), "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        mode: "paper",
        exchange: "bitget",
        productType: "USDT-FUTURES",
        generatedAt: new Date().toISOString(),
        symbol: SYMBOL,
        days: DAYS,
        startBalance: BALANCE,
        finalBalance: result.finalBalance,
        netPnl: result.netPnl,
        roundTrips: result.roundTrips,
        fleetGrid: FLEET_GRID,
        trades: result.trades.filter((t) => t.event === "fill"),
      },
      null,
      2
    )
  );

  const fills = result.trades.filter((t) => t.event === "fill");
  console.log(`\n=== Paper Trading 摘要 ===`);
  console.log(`标的: ${SYMBOL}`);
  console.log(`起始余额: ${BALANCE} USDT`);
  console.log(`最终余额: ${result.finalBalance.toFixed(2)} USDT`);
  console.log(`净利: ${result.netPnl.toFixed(2)} USDT (${result.returnPct.toFixed(2)}%)`);
  console.log(`成交笔数: ${fills.length}`);
  console.log(`完整格数: ${result.roundTrips}`);
  console.log(`\n已写入:\n  ${csvPath}\n  ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
