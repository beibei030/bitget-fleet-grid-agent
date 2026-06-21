"""gridModel.ts + gridCore.ts — VPS 网格回测与挂单逻辑。"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Literal

from bitget_grid.config import GridConfig

GridMode = Literal["neutral", "long", "short"]


@dataclass
class GridLot:
    id: str
    buy_price: float
    size: float
    sell_price: float
    bought_at: int


@dataclass
class GridBacktestResult:
    round_trips: int
    grid_fills: int
    volume_usd: float
    net_pnl: float
    gross_pnl: float
    fees: float
    funding_cost: float
    max_drawdown: float
    break_range_count: int
    days: float
    daily_net: float
    round_trips_per_month: float


def round_to_tick(price: float, tick: float = 0.01) -> float:
    return round(round(price / tick) * tick, 8)


def is_out_of_range(mark: float, center: float, range_pct: float) -> bool:
    return mark > center * (1 + range_pct) or mark < center * (1 - range_pct)


def size_per_grid(notional_usd: float, mark: float, levels: int) -> float:
    return notional_usd / max(mark, 1.0) / max(levels, 1)


def mint_lot(buy_price: float, size: float, step: float, ts: int) -> GridLot:
    bp = round_to_tick(buy_price)
    return GridLot(f"{ts}-{bp:.4f}", bp, size, round_to_tick(bp + step), ts)


def _avg_entry(lots: list[GridLot], fallback: float) -> float:
    if not lots:
        return fallback
    total = sum(l.size for l in lots)
    return sum(l.buy_price * l.size for l in lots) / total if total else fallback


def simulate_grid_on_bars(bars: list[dict], cfg: GridConfig) -> tuple[GridBacktestResult, list[dict]]:
    """与 VPS gridModel.simulateGridOnCandles 同构；bars 需含 ts/open/high/low/close。"""
    if len(bars) < 2:
        return _empty(cfg), []

    center = float(bars[0]["close"])
    step = center * cfg.resolved_step_pct(center)
    max_inv = cfg.notional_usd * cfg.max_inventory_pct
    position = 0.0
    lots: list[GridLot] = []
    cash = 0.0
    fees = 0.0
    funding = 0.0
    volume = 0.0
    round_trips = 0
    break_range = 0
    paused = False
    peak = 0.0
    max_dd = 0.0
    session_realized = 0.0
    day_start = 0.0
    day_key = ""
    trade_log: list[dict] = []
    fee_rate = cfg.maker_fee_rate

    def sz(mark: float) -> float:
        return size_per_grid(cfg.notional_usd, mark, cfg.grid_count)

    for b in bars:
        ts = int(b["ts"])
        close = float(b["close"])
        low = float(b["low"])
        high = float(b["high"])
        dk = str(b.get("day", ts // 86_400_000))

        if dk != day_key:
            day_key = dk
            day_start = session_realized

        if paused:
            if abs(close - center) / center < cfg.range_pct * 0.3 and position <= 0:
                paused = False
                center = close
                step = center * cfg.resolved_step_pct(center)
            else:
                continue

        if is_out_of_range(close, center, cfg.range_pct):
            if position > 0:
                pnl = position * (close - _avg_entry(lots, close))
                cash += pnl
                f = position * close * fee_rate
                fees += f
                volume += position * close
                trade_log.append({"ts": ts, "action": "FLATTEN", "price": close, "pnl": pnl - f, "size": position})
                position = 0.0
                lots = []
            break_range += 1
            paused = True
            if cfg.auto_recenter:
                center = close
                step = center * cfg.resolved_step_pct(center)
                paused = False
            continue

        grid_sz = sz(close)
        for j in range(1, cfg.max_orders_per_side + 1):
            px = round_to_tick(center - j * step)
            if px < center * (1 - cfg.range_pct):
                break
            if px >= close:
                continue
            if low > px:
                continue
            if position * close + grid_sz * px > max_inv:
                break
            position += grid_sz
            lots.append(mint_lot(px, grid_sz, step, ts))
            f = grid_sz * px * fee_rate
            fees += f
            volume += grid_sz * px
            trade_log.append({"ts": ts, "action": "BUY", "price": px, "pnl": -f, "size": grid_sz})

        for lot in list(lots):
            if high < lot.sell_price:
                continue
            gross = lot.size * (lot.sell_price - lot.buy_price)
            f = lot.size * lot.sell_price * fee_rate * 2
            cash += gross
            session_realized += gross - f
            fees += f
            volume += lot.size * lot.sell_price
            position -= lot.size
            round_trips += 1
            lots = [x for x in lots if x.id != lot.id]
            trade_log.append({"ts": ts, "action": "SELL", "price": lot.sell_price, "pnl": gross - f, "size": lot.size})

        if position > 0 and cfg.funding_8h > 0:
            funding += position * close * (cfg.funding_8h / 8)

        unreal = position * (close - _avg_entry(lots, close)) if position else 0.0
        eq = cash + unreal - fees - funding
        peak = max(peak, eq)
        max_dd = max(max_dd, peak - eq)

    if position > 0 and bars:
        last = float(bars[-1]["close"])
        cash += position * (last - _avg_entry(lots, last))

    net = cash - fees - funding
    days = max(1.0, len(bars) / 24)
    return (
        GridBacktestResult(
            round_trips=round_trips,
            grid_fills=len(trade_log),
            volume_usd=volume,
            net_pnl=net,
            gross_pnl=cash,
            fees=fees,
            funding_cost=funding,
            max_drawdown=max_dd,
            break_range_count=break_range,
            days=days,
            daily_net=net / days,
            round_trips_per_month=round_trips / (days / 30),
        ),
        trade_log,
    )


def _empty(cfg: GridConfig) -> GridBacktestResult:
    return GridBacktestResult(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0)
