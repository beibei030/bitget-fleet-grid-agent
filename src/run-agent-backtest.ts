#!/usr/bin/env node
/** Agent 网格回测 — 每 24h 重判趋势并切换 neutral/long/short/flat */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { fetchFuturesCandles } from "./bitgetPublicApi.js";
import { analyzeTrend, type GridMode } from "./trendAnalyzer.js";
import { FLEET_GRID, simulateFleetGrid } from "./fleetGridSim.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORT_DIR = path.resolve(__dirname, "../reports");

const SYMBOL = process.env.PAPER_SYMBOL ?? "SOLUSDT";
const DAYS = Number(process.env.BACKTEST_DAYS ?? 30);
const REBALANCE_BARS = 24;

async function main() {
  console.log(`Agent 网格回测 ${SYMBOL} ${DAYS}天 (每${REBALANCE_BARS}h 重判趋势)\n`);
  const bars = await fetchFuturesCandles(SYMBOL, "1H", DAYS);

  const segments: { mode: GridMode; bars: typeof bars; decision: ReturnType<typeof analyzeTrend> }[] = [];
  let i = REBATE_START(bars.length);
  while (i < bars.length) {
    const window = bars.slice(Math.max(0, i - 96), i + 1);
    const decision = analyzeTrend(window, 0.0001);
    const end = Math.min(i + REBALANCE_BARS, bars.length);
    segments.push({ mode: decision.gridMode, bars: bars.slice(i, end), decision });
    i = end;
  }

  let totalPnl = 0;
  const modeStats: Record<string, { pnl: number; bars: number }> = {};

  for (const seg of segments) {
    if (seg.mode === "flat" || seg.bars.length < 3) continue;
    const r = simulateFleetGrid(seg.bars, {
      symbol: SYMBOL,
      balanceUsd: 1000 / Math.max(segments.filter((s) => s.mode !== "flat").length, 1),
      gridMode: seg.mode,
    });
    totalPnl += r.netPnl;
    modeStats[seg.mode] = modeStats[seg.mode] ?? { pnl: 0, bars: 0 };
    modeStats[seg.mode].pnl += r.netPnl;
    modeStats[seg.mode].bars += seg.bars.length;
  }

  const decisions = segments.map((s) => ({
    at: new Date(s.bars[0]?.ts ?? 0).toISOString(),
    regime: s.decision.regime,
    mode: s.mode,
    confidence: s.decision.confidence,
  }));

  const md = [
    `# Agent 自适应网格回测 · ${SYMBOL}`,
    "",
    `- 天数: ${DAYS}`,
    `- 重判间隔: ${REBALANCE_BARS}h`,
    `- 组合净利: **${totalPnl.toFixed(2)} USDT**`,
    "",
    "## 分段模式统计",
    "",
    "| 模式 | 覆盖 K 线 | 分段净利 |",
    "| --- | ---: | ---: |",
    ...Object.entries(modeStats).map(([m, s]) => `| ${m} | ${s.bars} | ${s.pnl.toFixed(2)} |`),
    "",
    "## 决策时间线（节选）",
    "",
    ...decisions.slice(0, 15).map((d) => `- ${d.at.slice(0, 16)} **${d.regime}** → ${d.mode} (${(d.confidence * 100).toFixed(0)}%)`),
  ].join("\n");

  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(path.join(REPORT_DIR, `agent-backtest-${SYMBOL}-${stamp}.md`), md);
  fs.writeFileSync(path.join(REPORT_DIR, `agent-backtest-${SYMBOL}-${stamp}.json`), JSON.stringify({ totalPnl, modeStats, decisions }, null, 2));
  console.log(md);
}

function REBATE_START(n: number) {
  return Math.min(96, Math.floor(n * 0.05));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
