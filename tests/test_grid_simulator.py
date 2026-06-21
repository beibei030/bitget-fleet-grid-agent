"""Tests for RegimeGrid full simulator."""

import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from regime_router.grid_simulator import GridSimParams, RegimeGridBot, simulate_grid_on_candles


def _oscillating_bars(n: int = 96 * 7) -> list[dict]:
    """One week of 15m bars oscillating ±1.5% around center."""
    bars = []
    center = 100_000.0
    for i in range(n):
        wave = np.sin(i / 6.0) * 0.015
        close = center * (1 + wave)
        lo = close * 0.997
        hi = close * 1.003
        bars.append({"ts": 1_700_000_000_000 + i * 900_000, "open": close, "high": hi, "low": lo, "close": close})
    return bars


def test_grid_produces_many_round_trips():
    bars = _oscillating_bars()
    result = simulate_grid_on_candles(
        bars,
        GridSimParams(notional_usd=10_000, range_pct=0.05, levels=8, step_pct=0.008, recenter_drift_pct=0.008),
    )
    assert result["round_trips"] >= 15, f"expected many round trips, got {result['round_trips']}"
    assert result["round_trips_per_month"] >= 60, f"expected >=60/month, got {result['round_trips_per_month']:.1f}"


def test_grid_step_multiple_fills_one_bar():
    bot = RegimeGridBot(GridSimParams(notional_usd=10_000, range_pct=0.03, levels=5, max_orders_per_side=6))
    bot.reset(100_000.0)
    r = bot.step(
        ts_ms=1,
        ts_str="t",
        open_=99_000,
        high=99_500,
        low=97_500,
        close=99_000,
        active=True,
    )
    buys = [e for e in r.events if e.action == "GRID_BUY"]
    assert len(buys) >= 1
