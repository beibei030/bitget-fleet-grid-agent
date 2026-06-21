#!/usr/bin/env node
/** 拉 Bitget 历史 K 线 → 舰队网格回测 → 输出报告 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFuturesCandles, fetchTicker } from "./bitgetPublicApi.js";
import { FLEET_GRID, formatReport, simulateFleetGrid } from "./fleetGridSim.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const REPORT_DIR = path.join(ROOT, "reports");

const SYMBOLS = ["BTCUSDT", "ETHUSDT", "SOLUSDT"];
const DAYS = Number(process.env.BACKTEST_DAYS ?? 30);
const BALANCE = Number(process.env.BACKTEST_BALANCE ?? 1000);

async function main() {
  console.log(`Bitget 舰队网格回测 — ${DAYS} 天 / 每标的 ${BALANCE} USDT`);
  console.log(`参数: ${FLEET_GRID.gridCount}格 ±${FLEET_GRID.rangeHalfPct * 100}% ${FLEET_GRID.leverage}x\n`);

  const results = [];

  for (const symbol of SYMBOLS) {
    process.stdout.write(`拉取 ${symbol} K 线… `);
    const bars = await fetchFuturesCandles(symbol, "1H", DAYS);
    console.log(`${bars.length} 根`);

    let funding8h = 0.0001;
    try {
      await new Promise((r) => setTimeout(r, 400));
      const t = await fetchTicker(symbol);
      if (t.fundingRate != null) funding8h = Math.abs(t.fundingRate);
    } catch {
      /* 忽略 */
    }

    const r = simulateFleetGrid(bars, {
      symbol,
      balanceUsd: BALANCE,
      funding8h,
    });
    results.push(r);

    console.log(
      `  → 净利 ${r.netPnl.toFixed(2)} USDT (${r.returnPct.toFixed(2)}%) | 格数 ${r.roundTrips} | 回撤 ${r.maxDrawdown.toFixed(2)} | 重挂 ${r.recenterCount}`
    );
    await new Promise((r) => setTimeout(r, 600));
  }

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const md = formatReport(results);
  const stamp = new Date().toISOString().slice(0, 10);
  const mdPath = path.join(REPORT_DIR, `backtest-${stamp}.md`);
  const jsonPath = path.join(REPORT_DIR, `backtest-${stamp}.json`);

  fs.writeFileSync(mdPath, md, "utf8");
  fs.writeFileSync(
    jsonPath,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        days: DAYS,
        balancePerSymbol: BALANCE,
        fleetGrid: FLEET_GRID,
        results: results.map(({ trades, ...rest }) => rest),
      },
      null,
      2
    )
  );

  console.log(`\n${md}`);
  console.log(`\n已写入:\n  ${mdPath}\n  ${jsonPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
