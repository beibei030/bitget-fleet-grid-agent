/** 等差中性网格纯函数 — 与 VPS Decibel 网格同源 */

export type GridMode = "neutral" | "long" | "short" | "flat";

export interface GridSpec {
  levels: number[];
  spacing: number;
  count: number;
}

export function buildGrid(params: { lower: number; upper: number; gridCount: number }): GridSpec {
  const { lower, upper, gridCount } = params;
  if (!(upper > lower)) throw new Error("upper 必须大于 lower");
  if (!(gridCount >= 2)) throw new Error("gridCount 至少为 2");
  const spacing = (upper - lower) / gridCount;
  const levels: number[] = [];
  for (let i = 0; i <= gridCount; i++) levels.push(round(lower + i * spacing));
  return { levels, spacing: round(spacing), count: gridCount };
}

export function priceBand(price: number, halfPct: number) {
  return {
    lower: round(price * (1 - halfPct)),
    upper: round(price * (1 + halfPct)),
  };
}

function round(n: number, d = 6) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}
