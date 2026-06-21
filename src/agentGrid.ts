/** Agent 网格编排 — MCP 拉数据 → 趋势判断 → 网格计划 */
import { fetchFuturesCandles } from "./bitgetPublicApi.js";
import { getFuturesTicker } from "./bgcClient.js";
import { planGridOrders, formatGridPlan, type GridPlan } from "./gridPlanner.js";
import { analyzeTrend, formatTrendDecision, type TrendDecision } from "./trendAnalyzer.js";
import { FLEET_GRID } from "./fleetGridSim.js";

export interface AgentGridContext {
  symbol: string;
  price: number;
  funding8h: number;
  decision: TrendDecision;
  plan: GridPlan;
  decidedAt: string;
}

/** 通过 Bitget 公开 API / MCP 同源接口拉 4H K 线并决策 */
export async function runAgentDecision(input: {
  symbol: string;
  balanceUsd?: number;
  maxOrders?: number;
  candleGranularity?: "4H" | "1H";
  candleDays?: number;
}): Promise<AgentGridContext> {
  const symbol = input.symbol;
  const gran = input.candleGranularity ?? "4H";
  const days = input.candleDays ?? 30;

  const [candles, tickerRes] = await Promise.all([
    fetchFuturesCandles(symbol, gran, days),
    getFuturesTicker(symbol),
  ]);

  const ticker = Array.isArray(tickerRes.data) ? tickerRes.data[0] : (tickerRes as any).data?.[0];
  const price = Number(ticker?.lastPr ?? candles.at(-1)?.close ?? 0);
  const funding8h = Math.abs(Number(ticker?.fundingRate ?? 0));

  const decision = analyzeTrend(candles, funding8h);
  const plan = planGridOrders({
    symbol,
    price,
    balanceUsd: input.balanceUsd ?? 1000,
    gridMode: decision.gridMode,
    maxOrders: input.maxOrders ?? 4,
    gridCount: FLEET_GRID.gridCount,
    rangeHalfPct: FLEET_GRID.rangeHalfPct,
    leverage: FLEET_GRID.leverage,
  });

  return {
    symbol,
    price,
    funding8h,
    decision,
    plan,
    decidedAt: new Date().toISOString(),
  };
}

export function formatAgentReport(ctx: AgentGridContext): string {
  return [formatTrendDecision(ctx.decision, ctx.symbol), "", formatGridPlan(ctx.plan)].join("\n");
}
