"""Bitget 舰队网格参数 — 与 VPS Decibel DEC_CRYPTO_GRID 一致。"""

from __future__ import annotations

from dataclasses import dataclass
import os

# server/src/grid/fleetPlan.ts
DEC_CRYPTO_GRID = {
    "leverage": 5,
    "grid_count": 22,
    "range_half_pct": 0.024,
    "budget_use": 0.85,
    "skip_band": 0.1,
    "auto_recenter": True,
    "recenter_cooldown_sec": 30 * 60,
    "maker_fee_rate": 0.0002,
}

FLEET_SYMBOLS = ("BTCUSDT", "ETHUSDT", "SOLUSDT")


@dataclass
class GridConfig:
    symbol: str = "SOLUSDT"
    balance_usd: float = 1000.0
    leverage: float = DEC_CRYPTO_GRID["leverage"]
    grid_count: int = DEC_CRYPTO_GRID["grid_count"]
    range_half_pct: float = DEC_CRYPTO_GRID["range_half_pct"]
    budget_use: float = DEC_CRYPTO_GRID["budget_use"]
    skip_band: float = DEC_CRYPTO_GRID["skip_band"]
    maker_fee_rate: float = DEC_CRYPTO_GRID["maker_fee_rate"]
    funding_8h: float = 0.0001
    max_inventory_pct: float = 0.6
    max_orders_per_side: int = 8
    auto_recenter: bool = True
    recenter_cooldown_bars: int = 30

    @property
    def notional_usd(self) -> float:
        return self.balance_usd * self.leverage * self.budget_use

    @property
    def range_pct(self) -> float:
        return self.range_half_pct

    @property
    def levels(self) -> int:
        return self.grid_count

    def resolved_step_pct(self, mark: float) -> float:
        return (2 * self.range_half_pct) / max(self.grid_count, 1)

    @classmethod
    def from_env(cls) -> GridConfig:
        def f(k: str, d: float) -> float:
            v = os.getenv(k)
            return float(v) if v else d

        def s(k: str, d: str) -> str:
            return os.getenv(k, d)

        return cls(
            symbol=s("GRID_SYMBOL", "SOLUSDT").upper(),
            balance_usd=f("GRID_BALANCE_USD", 1000),
            leverage=f("GRID_LEVERAGE", DEC_CRYPTO_GRID["leverage"]),
            grid_count=int(f("GRID_COUNT", DEC_CRYPTO_GRID["grid_count"])),
            range_half_pct=f("GRID_RANGE_HALF_PCT", DEC_CRYPTO_GRID["range_half_pct"]),
            budget_use=f("GRID_BUDGET_USE", DEC_CRYPTO_GRID["budget_use"]),
            maker_fee_rate=f("GRID_MAKER_FEE", DEC_CRYPTO_GRID["maker_fee_rate"]),
            funding_8h=f("GRID_FUNDING_8H", 0.0001),
            auto_recenter=s("GRID_AUTO_RECENTER", "true").lower() == "true",
        )
