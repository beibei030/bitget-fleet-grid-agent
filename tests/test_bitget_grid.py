import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bitget_grid.config import GridConfig, DEC_CRYPTO_GRID
from bitget_grid.grid_model import simulate_grid_on_bars


def test_fleet_grid_round_trips():
    cfg = GridConfig(
        symbol="SOLUSDT",
        balance_usd=1000,
        grid_count=DEC_CRYPTO_GRID["grid_count"],
        range_half_pct=DEC_CRYPTO_GRID["range_half_pct"],
        leverage=DEC_CRYPTO_GRID["leverage"],
    )
    bars = []
    p = 100.0
    for i in range(24 * 14):
        p *= 1 + 0.003 * (1 if i % 16 < 8 else -1)
        bars.append({"ts": i * 3_600_000, "open": p, "high": p * 1.004, "low": p * 0.996, "close": p, "day": i // 24})
    r, _ = simulate_grid_on_bars(bars, cfg)
    assert r.round_trips >= 5
    assert r.net_pnl != 0
