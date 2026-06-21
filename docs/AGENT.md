# Agent 自适应网格

## 架构

```
Bitget MCP                    Agent 决策层                  网格执行层
─────────────                ─────────────                ─────────────
futures_get_candles    →     analyzeTrend()        →      planGridOrders()
futures_get_ticker     →     EMA / ADX / RSI              neutral | long | short | flat
futures_get_funding_rate →   资金费率过滤
futures_place_order    ←     post_only 限价单
```

## 趋势规则

| 条件 | 状态 | 网格 |
| --- | --- | --- |
| ADX < 18 且 EMA 价差 < 0.6% | RANGE | 中性 |
| ADX ≥ 20 且 EMA 多头 | BULL | 做多 |
| ADX ≥ 20 且 EMA 空头 | BEAR | 做空 |
| 置信度 < 58% | UNCLEAR | 空仓 |
| funding 多头拥挤 | 降级 | 中性 |

## 与 Cursor MCP 配合

重启 Cursor 加载 `.cursor/mcp.json` 后，可直接对 Agent 说：

> 查 SOL 4H 趋势，震荡铺中性网格，趋势明确只挂顺势一侧，不确定就空仓。

也可运行 CLI：`npm run agent:grid`

## 回测

`npm run agent:backtest` — 每 24h 重判趋势，分段回测各模式表现。
