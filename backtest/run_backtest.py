"""Bitget SOL/BTC 网格回测 — VPS gridModel + Bitget 真实 K 线。"""

from __future__ import annotations

import json
import sys
from dataclasses import asdict
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bitget_grid.bitget_data import get_candles_many, get_current_funding
from bitget_grid.config import GridConfig
from bitget_grid.grid_model import simulate_grid_on_bars


def main() -> None:
    cfg = GridConfig.from_env()
    out = ROOT / "backtest" / "results"
    out.mkdir(parents=True, exist_ok=True)

    print(
        f"Bitget 舰队网格 | {cfg.symbol} | ${cfg.balance_usd} | {cfg.leverage}x | "
        f"±{cfg.range_half_pct*100:.1f}% | {cfg.grid_count}格"
    )
    print("拉取 Bitget K 线 (1H)...")
    df = get_candles_many(cfg.symbol, granularity="1H", bars=720)
    print(f"  bars: {len(df)}")

    try:
        fr = get_current_funding(cfg.symbol)
        cfg.funding_8h = fr
        print(f"  当前资金费率: {fr:.6f}")
    except Exception as exc:  # noqa: BLE001
        print(f"  资金费率: 默认 ({exc})")

    bars = df.to_dict("records")
    for b in bars:
        b["day"] = int(b["ts"]) // 86_400_000

    result, trades = simulate_grid_on_bars(bars, cfg)
    days = result.days
    ret_pct = result.net_pnl / cfg.balance_usd * 100

    metrics = {
        "engine": "VPS fleet grid on Bitget candles",
        "symbol": cfg.symbol,
        "interval": "1H",
        "balance_usd": cfg.balance_usd,
        "notional_usd": cfg.notional_usd,
        "leverage": cfg.leverage,
        "range_half_pct": cfg.range_half_pct,
        "grid_count": cfg.grid_count,
        "round_trips": result.round_trips,
        "round_trips_per_month": round(result.round_trips_per_month, 1),
        "grid_fills": result.grid_fills,
        "volume_usd": round(result.volume_usd, 2),
        "net_pnl_usd": round(result.net_pnl, 2),
        "total_return_pct": round(ret_pct, 2),
        "daily_net_usd": round(result.daily_net, 2),
        "max_drawdown_usd": round(result.max_drawdown, 2),
        "break_range_count": result.break_range_count,
        "fees_usd": round(result.fees, 2),
        "funding_usd": round(result.funding_cost, 2),
        "days_covered": round(days, 1),
    }

    print("\n=== 结果 ===")
    print(f"  完整网格回合: {result.round_trips}  ({result.round_trips_per_month:.0f} /月)")
    print(f"  成交笔数:       {result.grid_fills}")
    print(f"  净利:           ${result.net_pnl:.2f}  ({ret_pct:+.2f}%)")
    print(f"  日均可赚:       ${result.daily_net:.2f}")
    print(f"  成交量:         ${result.volume_usd:,.0f}")
    print(f"  最大回撤:       ${result.max_drawdown:.2f}")
    print(f"  破区间次数:     {result.break_range_count}")

    with open(out / "metrics.json", "w", encoding="utf-8") as f:
        json.dump({"generated_at": datetime.now(timezone.utc).isoformat(), "metrics": metrics}, f, indent=2)

    import pandas as pd

    pd.DataFrame(trades).to_csv(out / "trades.csv", index=False)
    print(f"\nWrote {out / 'metrics.json'}")
    print(f"Wrote {out / 'trades.csv'}")


if __name__ == "__main__":
    main()
