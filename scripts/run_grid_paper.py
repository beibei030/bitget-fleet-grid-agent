"""Paper 网格主循环 — Bitget 真实 ticker，模拟挂单成交。"""

from __future__ import annotations

import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from bitget_grid.config import GridConfig
from bitget_grid.paper_grid import BitgetPaperGrid


def main() -> None:
    args = sys.argv[1:]
    cfg = GridConfig.from_env()
    bot = BitgetPaperGrid(cfg)

    if "--reset" in args:
        p = Path("paper/grid_state.json")
        if p.exists():
            p.unlink()
        print("Paper 网格已重置")

    st = bot.start() if "--reset" in args or not Path("paper/grid_state.json").exists() else bot.load()
    print(f"Bitget Paper Grid | {cfg.symbol} | center={st.center:.2f} | orders={len(st.open_orders)}")

    if "--loop" in args:
        print("循环模式 (每 6s tick)，Ctrl+C 停止")
        while True:
            st = bot.tick(st)
            print(
                f"  price={st.last_price:.2f} rt={st.round_trips} profit={st.grid_profit:.2f} "
                f"eq={st.equity:.2f} open={len(st.open_orders)} pos={st.position:.4f}"
            )
            time.sleep(6)
    else:
        st = bot.tick(st)
        print(
            f"  price={st.last_price:.2f} round_trips={st.round_trips} grid_profit={st.grid_profit:.2f} "
            f"equity={st.equity:.2f} open_orders={len(st.open_orders)}"
        )


if __name__ == "__main__":
    main()
