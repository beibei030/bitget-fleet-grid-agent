/** 趋势分析 — 输入 K 线 + 资金费率，输出网格模式（等同 MCP Agent 决策层） */

import type { CandleBar } from "./bitgetPublicApi.js";

export type TrendRegime = "RANGE" | "BULL" | "BEAR" | "UNCLEAR";
export type GridMode = "neutral" | "long" | "short" | "flat";

export interface TrendSignals {
  emaFast: number;
  emaSlow: number;
  emaSpreadPct: number;
  adx: number;
  rsi: number;
  funding8h: number;
  price: number;
}

export interface TrendDecision {
  regime: TrendRegime;
  gridMode: GridMode;
  confidence: number;
  signals: TrendSignals;
  reasoning: string[];
  mcpToolsUsed: string[];
}

export interface TrendConfig {
  emaFastPeriod: number;
  emaSlowPeriod: number;
  adxPeriod: number;
  rsiPeriod: number;
  adxTrendMin: number;
  adxRangeMax: number;
  minConfidence: number;
  maxFundingLong: number;
  minFundingShort: number;
}

export const DEFAULT_TREND_CONFIG: TrendConfig = {
  emaFastPeriod: 12,
  emaSlowPeriod: 26,
  adxPeriod: 14,
  rsiPeriod: 14,
  adxTrendMin: 20,
  adxRangeMax: 18,
  minConfidence: 0.58,
  maxFundingLong: 0.00025,
  minFundingShort: -0.00015,
};

export function analyzeTrend(
  candles: CandleBar[],
  funding8h = 0,
  cfg: TrendConfig = DEFAULT_TREND_CONFIG
): TrendDecision {
  const mcpToolsUsed = ["futures_get_candles", "futures_get_ticker"];
  const reasoning: string[] = [];

  if (candles.length < cfg.emaSlowPeriod + cfg.adxPeriod + 5) {
    return flatDecision(candles.at(-1)?.close ?? 0, funding8h, reasoning, "K 线不足", mcpToolsUsed);
  }

  const closes = candles.map((c) => c.close);
  const price = closes[closes.length - 1];
  const emaFast = ema(closes, cfg.emaFastPeriod);
  const emaSlow = ema(closes, cfg.emaSlowPeriod);
  const emaSpreadPct = ((emaFast - emaSlow) / emaSlow) * 100;
  const adx = calcAdx(candles, cfg.adxPeriod);
  const rsi = calcRsi(closes, cfg.rsiPeriod);

  const signals: TrendSignals = { emaFast, emaSlow, emaSpreadPct, adx, rsi, funding8h, price };

  reasoning.push(`EMA${cfg.emaFastPeriod}/${cfg.emaSlowPeriod} 价差 ${emaSpreadPct.toFixed(2)}%`);
  reasoning.push(`ADX(14)=${adx.toFixed(1)} RSI=${rsi.toFixed(1)} funding=${(funding8h * 100).toFixed(4)}%`);

  let regime: TrendRegime = "UNCLEAR";
  let confidence = 0.5;

  if (adx < cfg.adxRangeMax && Math.abs(emaSpreadPct) < 0.6) {
    regime = "RANGE";
    confidence = 0.65 + (cfg.adxRangeMax - adx) * 0.02;
    reasoning.push("低 ADX + EMA 收敛 → 震荡，中性网格");
  } else if (adx >= cfg.adxTrendMin && emaSpreadPct > 0.35 && emaFast > emaSlow) {
    regime = "BULL";
    confidence = 0.55 + Math.min(adx / 50, 0.35) + Math.min(emaSpreadPct / 3, 0.15);
    reasoning.push("EMA 多头 + ADX 确认 → 上升趋势，做多网格");
  } else if (adx >= cfg.adxTrendMin && emaSpreadPct < -0.35 && emaFast < emaSlow) {
    regime = "BEAR";
    confidence = 0.55 + Math.min(adx / 50, 0.35) + Math.min(Math.abs(emaSpreadPct) / 3, 0.15);
    reasoning.push("EMA 空头 + ADX 确认 → 下降趋势，做空网格");
  } else {
    regime = "UNCLEAR";
    confidence = 0.4;
    reasoning.push("信号不一致 → 空仓观望");
  }

  if (regime === "BULL" && funding8h > cfg.maxFundingLong) {
    regime = "RANGE";
    confidence *= 0.85;
    reasoning.push("资金费率偏高 → 降级中性网格");
    mcpToolsUsed.push("futures_get_funding_rate");
  }
  if (regime === "BEAR" && funding8h < cfg.minFundingShort) {
    regime = "RANGE";
    confidence *= 0.85;
    reasoning.push("资金费率偏负 → 降级中性网格");
    mcpToolsUsed.push("futures_get_funding_rate");
  }

  if (rsi > 72 && regime === "BULL") {
    confidence *= 0.9;
    reasoning.push("RSI 超买，降低做多置信度");
  }
  if (rsi < 28 && regime === "BEAR") {
    confidence *= 0.9;
    reasoning.push("RSI 超卖，降低做空置信度");
  }

  confidence = Math.min(0.95, Math.max(0, confidence));

  let gridMode: GridMode = regimeToMode(regime);
  if (confidence < cfg.minConfidence) {
    gridMode = "flat";
    reasoning.push(`置信度 ${(confidence * 100).toFixed(0)}% 不足 → 空仓`);
  }

  return { regime, gridMode, confidence, signals, reasoning, mcpToolsUsed };
}

export function regimeToMode(regime: TrendRegime): GridMode {
  switch (regime) {
    case "RANGE":
      return "neutral";
    case "BULL":
      return "long";
    case "BEAR":
      return "short";
    default:
      return "flat";
  }
}

export function formatTrendDecision(d: TrendDecision, symbol: string): string {
  const modeLabel = { neutral: "中性网格", long: "做多网格", short: "做空网格", flat: "空仓" }[d.gridMode];
  return [
    `# Agent 趋势决策 · ${symbol}`,
    "",
    `| 项目 | 值 |`,
    `| --- | --- |`,
    `| 市场状态 | **${d.regime}** |`,
    `| 网格模式 | **${modeLabel}** |`,
    `| 置信度 | ${(d.confidence * 100).toFixed(1)}% |`,
    `| 现价 | ${d.signals.price.toFixed(2)} |`,
    `| EMA 价差 | ${d.signals.emaSpreadPct.toFixed(2)}% |`,
    `| ADX | ${d.signals.adx.toFixed(1)} |`,
    `| RSI | ${d.signals.rsi.toFixed(1)} |`,
    "",
    "## 推理",
    ...d.reasoning.map((r) => `- ${r}`),
    "",
    "## MCP 数据源",
    ...d.mcpToolsUsed.map((t) => `- \`${t}\``),
  ].join("\n");
}

function flatDecision(
  price: number,
  funding8h: number,
  reasoning: string[],
  why: string,
  mcpToolsUsed: string[]
): TrendDecision {
  reasoning.push(why);
  return {
    regime: "UNCLEAR",
    gridMode: "flat",
    confidence: 0,
    signals: { emaFast: price, emaSlow: price, emaSpreadPct: 0, adx: 0, rsi: 50, funding8h, price },
    reasoning,
    mcpToolsUsed,
  };
}

function ema(values: number[], period: number): number {
  const k = 2 / (period + 1);
  let v = values[0];
  for (let i = 1; i < values.length; i++) v = values[i] * k + v * (1 - k);
  return v;
}

function calcRsi(closes: number[], period: number): number {
  if (closes.length < period + 1) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d >= 0) gains += d;
    else losses -= d;
  }
  if (losses === 0) return 100;
  return 100 - 100 / (1 + gains / losses);
}

function calcAdx(candles: CandleBar[], period: number): number {
  if (candles.length < period + 2) return 0;
  const dxs: number[] = [];
  for (let i = candles.length - period; i < candles.length; i++) {
    const cur = candles[i];
    const prev = candles[i - 1];
    const up = cur.high - prev.high;
    const down = prev.low - cur.low;
    const plusDm = up > down && up > 0 ? up : 0;
    const minusDm = down > up && down > 0 ? down : 0;
    const tr = Math.max(cur.high - cur.low, Math.abs(cur.high - prev.close), Math.abs(cur.low - prev.close));
    if (tr <= 0) continue;
    dxs.push((Math.abs(plusDm - minusDm) / tr) * 100);
  }
  return dxs.length ? dxs.reduce((a, b) => a + b, 0) / dxs.length : 0;
}
