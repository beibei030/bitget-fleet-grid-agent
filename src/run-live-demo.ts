#!/usr/bin/env node
/**
 * Bitget Agent Hub Live Demo
 * - 默认 dry-run：拉 ticker + 打印网格计划
 * - --execute：Demo Trading 环境真实挂单（需 BITGET_* Demo API Key）
 *
 * 用法:
 *   npm run live:demo
 *   npm run live:demo -- --execute --symbol SOLUSDT
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  bgc,
  cancelAllOrders,
  getFuturesBalance,
  getFuturesPositions,
  getFuturesTicker,
  getPendingOrders,
  hasBitgetCredentials,
  placeGridOrders,
  setLeverage,
} from "./bgcClient.js";
import { formatGridPlan, planGridOrders } from "./gridPlanner.js";
import { FLEET_GRID } from "./fleetGridSim.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LOG_DIR = path.resolve(__dirname, "../logs");

const args = process.argv.slice(2);
const EXECUTE = args.includes("--execute");
const SYMBOL = getArg("--symbol") ?? process.env.DEMO_SYMBOL ?? "SOLUSDT";
const BALANCE = Number(getArg("--balance") ?? process.env.DEMO_BALANCE ?? 1000);
const MAX_ORDERS = Number(getArg("--max-orders") ?? 4);
const PAPER = !args.includes("--live");

function getArg(name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

async function main() {
  const mode = EXECUTE ? (PAPER ? "paper-execute" : "live-execute") : "dry-run";
  console.log(`\n=== Bitget Agent Hub Live Demo ===`);
  console.log(`模式: ${mode} | 标的: ${SYMBOL} | 余额假设: ${BALANCE} USDT`);
  console.log(`网格: ${FLEET_GRID.gridCount}格 ±${FLEET_GRID.rangeHalfPct * 100}% ${FLEET_GRID.leverage}x\n`);

  // 1) 公开行情 — 等同 MCP futures_get_ticker
  console.log("[1/5] futures_get_ticker …");
  const tickerRes = await getFuturesTicker(SYMBOL);
  const ticker = Array.isArray(tickerRes.data) ? tickerRes.data[0] : (tickerRes as any).data?.[0];
  if (!ticker?.lastPr) {
    console.error("无法获取 ticker:", JSON.stringify(tickerRes, null, 2));
    process.exit(1);
  }
  const price = Number(ticker.lastPr);
  const funding = ticker.fundingRate ?? "?";
  console.log(`  现价 ${price} | 资金费率 ${funding} | mark ${ticker.markPrice ?? "?"}`);

  // 2) 账户（需 API Key）
  let balanceNote = "未配置 BITGET_*，跳过";
  if (hasBitgetCredentials()) {
    console.log("\n[2/5] account_get_balance (Demo Trading) …");
    try {
      const bal = await getFuturesBalance(PAPER);
      balanceNote = JSON.stringify(bal.data ?? bal).slice(0, 200);
      console.log(`  ${balanceNote}`);
    } catch (e: any) {
      console.log(`  余额查询: ${e.message}`);
    }

    console.log("\n[3/5] futures_get_positions …");
    try {
      const pos = await getFuturesPositions(SYMBOL, PAPER);
      console.log(`  ${JSON.stringify(pos.data ?? pos).slice(0, 300)}`);
    } catch (e: any) {
      console.log(`  持仓: ${e.message}`);
    }
  } else {
    console.log("\n[2/5] 跳过 account（设置 BITGET_API_KEY / SECRET / PASSPHRASE 后可查 Demo 账户）");
    console.log("[3/5] 跳过 positions");
  }

  // 3) 网格计划
  console.log("\n[4/5] 计算网格计划（VPS 同源参数）…");
  const plan = planGridOrders({
    symbol: SYMBOL,
    price,
    balanceUsd: BALANCE,
    maxOrders: MAX_ORDERS,
  });
  console.log("\n" + formatGridPlan(plan));

  const allOrders = [...plan.buyOrders, ...plan.sellOrders];
  const log: Record<string, unknown> = {
    at: new Date().toISOString(),
    mode,
    symbol: SYMBOL,
    price,
    funding,
    plan: {
      lower: plan.lower,
      upper: plan.upper,
      gridCount: plan.gridCount,
      spacing: plan.spacing,
      sizeBase: plan.sizeBase,
      orderCount: allOrders.length,
    },
    orders: allOrders,
    executed: false,
  };

  // 4) 执行挂单
  if (EXECUTE) {
    if (!hasBitgetCredentials()) {
      console.error("\n❌ --execute 需要 BITGET_API_KEY / BITGET_SECRET_KEY / BITGET_PASSPHRASE");
      console.error("   在 bitget.com → API 管理 创建 Demo Trading Key，写入 .env 后重试");
      process.exit(1);
    }

    console.log(`\n[5/5] futures_set_leverage + futures_place_order (${allOrders.length} 单) …`);
    try {
      await setLeverage(SYMBOL, plan.leverage, PAPER);
      console.log(`  杠杆已设 ${plan.leverage}x`);

      if (args.includes("--cancel-first")) {
        try {
          await cancelAllOrders(SYMBOL, PAPER);
          console.log("  已撤销旧单");
        } catch (e: any) {
          if (!String(e.message).includes("No order to cancel")) {
            console.log(`  撤单: ${e.message}`);
          }
        }
      }

      const placeRes = await placeGridOrders(allOrders, PAPER);
      console.log(`  下单响应: ${JSON.stringify(placeRes.data ?? placeRes).slice(0, 400)}`);
      log.executed = true;
      log.placeResult = placeRes;

      await sleep(1500);
      const pending = await getPendingOrders(SYMBOL, PAPER);
      console.log(`\n  当前挂单: ${JSON.stringify(pending.data ?? pending).slice(0, 500)}`);
      log.pending = pending.data ?? pending;
    } catch (e: any) {
      console.error(`  下单失败: ${e.message}`);
      log.error = e.message;
    }
  } else {
    console.log("\n[5/5] dry-run 完成 — 添加 --execute 可在 Demo Trading 挂单");
    console.log("  示例: npm run live:demo -- --execute --symbol SOLUSDT --cancel-first");
    console.log("\n  Cursor MCP 等效调用:");
    console.log("  - futures_get_ticker(productType=USDT-FUTURES, symbol=SOLUSDT)");
    console.log("  - futures_set_leverage(...)");
    console.log("  - futures_place_order(orders=[...post_only limit...])");
  }

  fs.mkdirSync(LOG_DIR, { recursive: true });
  const logPath = path.join(LOG_DIR, `live-demo-${SYMBOL}-${Date.now()}.json`);
  fs.writeFileSync(logPath, JSON.stringify(log, null, 2));
  console.log(`\n日志已写入 ${logPath}`);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
