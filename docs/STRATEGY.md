# 策略说明

## 核心假设

加密主流标（BTC/ETH/SOL）在多数时间处于 **震荡区间**；中性网格通过「低买一格、高卖一格」赚取格距，优于单边押方向。

## VPS 实盘参数

来自 Decibel 8083 舰队 `DEC_CRYPTO_GRID`：

- 22 格等差网格
- ±2.4% 半宽（`rangeHalfPct=0.024`）
- 5x 杠杆，85% 预算利用率
- 破区间后 30h 冷却自动重挂

## 优化点（相对初版）

1. **统一舰队参数**：22 格 / ±2.4% / 5x（VPS 8083 同源）
2. **Agent 趋势层**：MCP 拉 4H K 线 → EMA/ADX/RSI → 自动切换 neutral/long/short/flat
3. **资金费率过滤**：多头拥挤时降级为中性网格
4. **库存上限**：名义敞口 ≤ notional × 60%

## 引擎分工

| 引擎 | 用途 |
| --- | --- |
| `src/fleetGridSim.ts` | 三标的组合回测、Paper CSV、提交报告 |
| `bitget_grid/grid_model.py` | Python 单标的快速回测 |
| `bitget_grid/paper_grid.py` | 实时 ticker Paper 网格 |
| `src/run-agent-grid.ts` | **Agent 自适应网格 Live Demo** |
| `src/trendAnalyzer.ts` | 趋势规则引擎 |

## 风险

网格在单边趋势中会累积 inventory；依赖 auto-recenter 与 funding 过滤控制尾部风险。回测区间表现因行情而异，提交以 Paper 日志 + 可复现代码为准。
