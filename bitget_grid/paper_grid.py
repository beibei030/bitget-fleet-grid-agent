"""Bitget Paper 网格 — VPS GridBot 行为 + Bitget 真实行情。

- 行情/ K 线：Bitget 公共 API（与 MCP 同源）
- 下单：Paper 模拟 PostOnly 限价单（黑客松不要求真实资金）
- 可选：配置 BITGET_API_KEY 后读账户余额（Agent Hub Read）
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path

from bitget_grid.bitget_data import get_ticker
from bitget_grid.config import GridConfig
from bitget_grid.grid_model import is_out_of_range, mint_lot, round_to_tick, size_per_grid


@dataclass
class OpenOrder:
    order_id: str
    side: str
    price: float
    size: float
    level_index: int
    reduce_only: bool = False


@dataclass
class PaperState:
    symbol: str
    center: float
    step: float
    lower: float
    upper: float
    equity: float
    initial: float
    position: float = 0.0
    lots: list = field(default_factory=list)
    open_orders: list[OpenOrder] = field(default_factory=list)
    round_trips: int = 0
    grid_profit: float = 0.0
    volume: float = 0.0
    fills: list[dict] = field(default_factory=list)
    last_price: float = 0.0
    last_recenter: float = 0.0
    paused: bool = False
    running: bool = True


class BitgetPaperGrid:
    """中性网格：买低卖高一格，破区间 re-center（与 VPS gridBot autoRecenter 一致）。"""

    def __init__(self, cfg: GridConfig | None = None, state_path: Path | None = None):
        self.cfg = cfg or GridConfig.from_env()
        self.state_path = state_path or Path("paper/grid_state.json")
        self._oid = 0

    def _next_id(self) -> str:
        self._oid += 1
        return f"paper-{self._oid}"

    def _band(self, price: float) -> tuple[float, float, float]:
        half = self.cfg.range_half_pct
        lower = round_to_tick(price * (1 - half))
        upper = round_to_tick(price * (1 + half))
        step = price * self.cfg.resolved_step_pct(price)
        return lower, upper, step

    def start(self, price: float | None = None) -> PaperState:
        if price is None:
            price = float(get_ticker(self.cfg.symbol)["lastPr"])
        lower, upper, step = self._band(price)
        st = PaperState(
            symbol=self.cfg.symbol,
            center=price,
            step=step,
            lower=lower,
            upper=upper,
            equity=self.cfg.balance_usd,
            initial=self.cfg.balance_usd,
            last_price=price,
            last_recenter=time.time(),
        )
        self._seed(st, price)
        self._save(st)
        return st

    def _seed(self, st: PaperState, price: float) -> None:
        st.open_orders.clear()
        max_inv = self.cfg.notional_usd * self.cfg.max_inventory_pct
        sz = size_per_grid(self.cfg.notional_usd, price, self.cfg.grid_count)
        inv = st.position * price
        n = 0
        for j in range(1, 31):
            if n >= self.cfg.max_orders_per_side:
                break
            px = round_to_tick(st.center - j * st.step)
            if px < st.lower:
                break
            if px >= price * 0.9995:
                continue
            if inv + sz * px > max_inv:
                break
            st.open_orders.append(OpenOrder(self._next_id(), "buy", px, sz, j))
            inv += sz * px
            n += 1
        for lot in st.lots:
            st.open_orders.append(
                OpenOrder(self._next_id(), "sell", lot.sell_price, lot.size, -1, reduce_only=True)
            )

    def tick(self, st: PaperState | None = None) -> PaperState:
        st = st or self.load()
        ticker = get_ticker(st.symbol)
        price = float(ticker["lastPr"])
        st.last_price = price

        if st.lower <= price <= st.upper:
            st.paused = False
        elif is_out_of_range(price, st.center, self.cfg.range_half_pct):
            if self.cfg.auto_recenter and time.time() - st.last_recenter >= self.cfg.recenter_cooldown_sec:
                st.center = price
                st.lower, st.upper, st.step = self._band(price)
                st.last_recenter = time.time()
                st.open_orders.clear()
                self._seed(st, price)
            else:
                st.paused = True

        if not st.paused:
            self._match_fills(st, price)
            self._seed_sells(st)

        self._save(st)
        return st

    def _match_fills(self, st: PaperState, price: float) -> None:
        fee = self.cfg.maker_fee_rate
        remaining: list[OpenOrder] = []
        for o in st.open_orders:
            hit = (o.side == "buy" and price <= o.price) or (o.side == "sell" and price >= o.price)
            if not hit:
                remaining.append(o)
                continue
            if o.side == "buy":
                f = o.size * o.price * fee
                st.position += o.size
                lot = mint_lot(o.price, o.size, st.step, int(time.time() * 1000))
                st.lots.append(lot)
                st.equity -= f
                st.volume += o.size * o.price
                st.fills.insert(0, {"t": time.time(), "side": "buy", "price": o.price, "size": o.size})
            else:
                gross = o.size * (o.price - st.lots[0].buy_price) if st.lots else 0
                f = o.size * o.price * fee * 2
                st.position = max(0, st.position - o.size)
                st.lots = st.lots[1:] if st.lots else []
                st.round_trips += 1
                st.grid_profit += gross - f
                st.equity += gross - f
                st.volume += o.size * o.price
                st.fills.insert(0, {"t": time.time(), "side": "sell", "price": o.price, "size": o.size, "pnl": gross - f})
        st.open_orders = remaining

    def _seed_sells(self, st: PaperState) -> None:
        have_sell = {o.price for o in st.open_orders if o.side == "sell"}
        for lot in st.lots:
            if lot.sell_price not in have_sell:
                st.open_orders.append(
                    OpenOrder(self._next_id(), "sell", lot.sell_price, lot.size, -1, reduce_only=True)
                )

    def load(self) -> PaperState:
        if not self.state_path.exists():
            return self.start()
        d = json.loads(self.state_path.read_text(encoding="utf-8"))
        st = PaperState(**{k: d[k] for k in PaperState.__dataclass_fields__ if k in d})
        st.open_orders = [OpenOrder(**x) for x in d.get("open_orders", [])]
        st.fills = d.get("fills", [])
        return st

    def _save(self, st: PaperState) -> None:
        self.state_path.parent.mkdir(parents=True, exist_ok=True)
        lots_payload = []
        for x in st.lots:
            lots_payload.append(x.__dict__ if hasattr(x, "__dict__") and not isinstance(x, dict) else x)
        payload = {
            **{k: getattr(st, k) for k in PaperState.__dataclass_fields__},
            "lots": lots_payload,
            "open_orders": [x.__dict__ for x in st.open_orders],
            "updated_at": datetime.now(timezone.utc).isoformat(),
            "data_source": "bitget_live_ticker",
        }
        self.state_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")
