/** 根据 VPS 参数计算 Bitget 网格挂单计划 */
import { buildGrid, priceBand, type GridMode } from "./gridCore.js";
import { FLEET_GRID } from "./fleetGridSim.js";
import type { GridOrderSpec } from "./bgcClient.js";

export interface GridPlan {
  symbol: string;
  price: number;
  lower: number;
  upper: number;
  gridCount: number;
  spacing: number;
  sizeBase: number;
  leverage: number;
  gridMode: GridMode;
  buyOrders: GridOrderSpec[];
  sellOrders: GridOrderSpec[];
}

export function planGridOrders(input: {
  symbol: string;
  price: number;
  balanceUsd: number;
  gridMode?: GridMode;
  maxOrders?: number;
  gridCount?: number;
  rangeHalfPct?: number;
  leverage?: number;
}): GridPlan {
  const gridMode = input.gridMode ?? "neutral";
  if (gridMode === "flat") {
    return {
      symbol: input.symbol,
      price: input.price,
      lower: input.price,
      upper: input.price,
      gridCount: 0,
      spacing: 0,
      sizeBase: 0,
      leverage: input.leverage ?? FLEET_GRID.leverage,
      gridMode,
      buyOrders: [],
      sellOrders: [],
    };
  }
  const gridCount = input.gridCount ?? FLEET_GRID.gridCount;
  const rangeHalfPct = input.rangeHalfPct ?? FLEET_GRID.rangeHalfPct;
  const leverage = input.leverage ?? FLEET_GRID.leverage;
  const maxOrders = input.maxOrders ?? 6;

  const { lower, upper } = priceBand(input.price, rangeHalfPct);
  const grid = buildGrid({ lower, upper, gridCount });
  const notional = input.balanceUsd * leverage * FLEET_GRID.budgetUse;
  const sizeBase = Math.max(notional / gridCount / input.price, 0.01);
  const sizeStr = sizeBase.toFixed(2);

  const skipBand = grid.spacing * FLEET_GRID.skipBand;
  const buyOrders: GridOrderSpec[] = [];
  const sellOrders: GridOrderSpec[] = [];

  for (const lvl of grid.levels) {
    if (Math.abs(lvl - input.price) < skipBand) continue;
    const placeBuy = (gridMode === "neutral" || gridMode === "long") && lvl < input.price && buyOrders.length < maxOrders;
    const placeSell = (gridMode === "neutral" || gridMode === "short") && lvl > input.price && sellOrders.length < maxOrders;
    if (placeBuy) {
      buyOrders.push({
        productType: "USDT-FUTURES",
        symbol: input.symbol,
        side: "buy",
        tradeSide: "open",
        orderType: "limit",
        price: lvl.toFixed(2),
        size: sizeStr,
        marginCoin: "USDT",
        force: "post_only" as const,
        clientOid: `grid-b-${Math.round(lvl)}`,
      });
    } else if (placeSell) {
      sellOrders.push({
        productType: "USDT-FUTURES",
        symbol: input.symbol,
        side: "sell",
        tradeSide: "open",
        orderType: "limit",
        price: lvl.toFixed(2),
        size: sizeStr,
        marginCoin: "USDT",
        force: "post_only" as const,
        clientOid: `grid-s-${Math.round(lvl)}`,
      });
    }
  }

  return {
    symbol: input.symbol,
    price: input.price,
    lower,
    upper,
    gridCount,
    spacing: grid.spacing,
    sizeBase,
    leverage,
    gridMode,
    buyOrders,
    sellOrders,
  };
}

const MODE_LABEL: Record<GridMode, string> = {
  neutral: "中性",
  long: "做多",
  short: "做空",
  flat: "空仓",
};

export function formatGridPlan(plan: GridPlan): string {
  const lines = [
    `# 网格计划 ${plan.symbol}`,
    "",
    `- 模式: **${MODE_LABEL[plan.gridMode]}**`,
    `- 现价: ${plan.price}`,
    `- 区间: ${plan.lower} ~ ${plan.upper} (±${(FLEET_GRID.rangeHalfPct * 100).toFixed(1)}%)`,
    `- 格数: ${plan.gridCount} | 格距: ${plan.spacing.toFixed(4)} | 每格: ${plan.sizeBase.toFixed(4)} | 杠杆: ${plan.leverage}x`,
    "",
    "## 买单（低于现价）",
    ...plan.buyOrders.map((o) => `- ${o.price} × ${o.size}`),
    "",
    "## 卖单（高于现价）",
    ...plan.sellOrders.map((o) => `- ${o.price} × ${o.size}`),
  ];
  return lines.join("\n");
}
