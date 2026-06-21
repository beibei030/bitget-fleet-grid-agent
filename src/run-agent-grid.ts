#!/usr/bin/env node
/**
 * Agent 自适应网格 — MCP 趋势判断 + 模式切换
 *
 * npm run agent:grid
 * npm run agent:grid -- --execute --symbol SOLUSDT
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  cancelAllOrders,
  getFuturesBalance,
  getFuturesPositions,
  hasBitgetCredentials,
  placeGridOrders,
  setLeverage,
} from "./bgcClient.js";
import { runAgentDecision, formatAgentReport } from "./agentGrid.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../logs");

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const SYMBOL = getArg("--symbol") ?? process.env.DEMO_SYMBOL ?? "SOLUSDT";
const BALANCE = Number(getArg("--balance") ?? 1000);
const MAX_ORDERS = Number(getArg("--max-orders") ?? 4);
const PAPER = !args.includes("--live");

function getArg(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  console.log(`\n=== Agent 自适应网格 ===`);
  console.log(`标的: ${SYMBOL} | ${EXECUTE ? "execute" : "dry-run"}\n`);

  console.log("[1] MCP futures_get_candles + futures_get_ticker …");
  const ctx = await runAgentDecision({ symbol: SYMBOL, balanceUsd: BALANCE, maxOrders: MAX_ORDERS });
  console.log(formatAgentReport(ctx));

  if (hasBitgetCredentials()) {
    console.log("\n[2] get_account_assets …");
    try {
      const bal = await getFuturesBalance(PAPER);
      console.log(`  ${JSON.stringify(bal.data ?? bal).slice(0, 180)}`);
    } catch (e: any) {
      console.log(`  ${e.message}`);
    }
    try {
      const pos = await getFuturesPositions(SYMBOL, PAPER);
      console.log(`  持仓: ${JSON.stringify(pos.data ?? pos).slice(0, 120)}`);
    } catch {
      /* ignore */
    }
  }

  const orders = [...ctx.plan.buyOrders, ...ctx.plan.sellOrders];
  const log: Record<string, unknown> = {
    ...ctx,
    mode: EXECUTE ? "execute" : "dry-run",
    orderCount: orders.length,
    executed: false,
  };

  if (ctx.decision.gridMode === "flat") {
    console.log("\n[3] 决策为空仓，不挂单");
    if (EXECUTE && hasBitgetCredentials()) {
      try {
        await cancelAllOrders(SYMBOL, PAPER);
        console.log("  已撤销现有挂单");
      } catch {
        /* ignore */
      }
    }
  } else if (EXECUTE) {
    if (!hasBitgetCredentials()) {
      console.error("\n需要 BITGET_* 环境变量才能 --execute");
      process.exit(1);
    }
    console.log(`\n[3] futures_place_order (${orders.length} 单, 模式=${ctx.decision.gridMode}) …`);
    try {
      await setLeverage(SYMBOL, ctx.plan.leverage, PAPER);
      const res = await placeGridOrders(orders, PAPER);
      log.executed = true;
      log.placeResult = res;
      console.log(`  完成: ${JSON.stringify(res).slice(0, 300)}`);
    } catch (e: any) {
      console.error(`  ${e.message}`);
      log.error = e.message;
    }
  } else {
    console.log(`\n[3] dry-run — 将挂 ${orders.length} 单 (${ctx.decision.gridMode})`);
    console.log("  执行: npm run agent:grid -- --execute --symbol " + SYMBOL);
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const out = path.join(LOG_DIR, `agent-${SYMBOL}-${Date.now()}.json`);
  fs.writeFileSync(out, JSON.stringify(log, null, 2));
  console.log(`\n日志: ${out}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
