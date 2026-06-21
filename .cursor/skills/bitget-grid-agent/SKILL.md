# Agent 自适应网格（Bitget MCP）

当用户要求趋势判断、自适应网格、做多/做空网格切换时使用。

## 决策流程

1. `futures_get_candles` — 拉 4H K 线（90 根）
2. `futures_get_ticker` — 现价 + 资金费率
3. 本地 `analyzeTrend()` — EMA12/26、ADX、RSI → 市场状态
4. 映射网格模式：
   - **RANGE** → 中性网格（双边挂单）
   - **BULL** → 做多网格（仅下方买单）
   - **BEAR** → 做空网格（仅上方卖单）
   - **UNCLEAR / 低置信度** → 空仓 + 撤单
5. `futures_set_leverage` + `futures_place_order` — Demo 挂单

## CLI

```bash
npm run agent:grid
npm run agent:grid -- --execute --symbol SOLUSDT
npm run agent:backtest
```

## Cursor MCP 自然语言示例

> 用 Bitget MCP 查 SOL 4H K 线和资金费率，判断趋势，如果是震荡就铺中性网格，如果是上涨趋势只挂下方买单，置信度不够就空仓。

对应工具：`futures_get_candles`, `futures_get_ticker`, `futures_get_funding_rate`, `futures_place_order`

## 源码

- `src/trendAnalyzer.ts` — 趋势规则引擎
- `src/agentGrid.ts` — 编排
- `src/gridPlanner.ts` — 按模式生成挂单
