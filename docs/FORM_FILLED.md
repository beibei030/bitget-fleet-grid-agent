# 表单已填内容备份 — Bitget Hackathon S1

> 生成时间：2026-06-21  
> 表单：https://forms.gle/GDQNx5TnCBvYuPin9

## 基本信息

| 字段 | 内容 |
| --- | --- |
| 赛道 | 赛道一 · 交易 Agent |
| 项目名 | Bitget Fleet Grid Agent |
| GitHub | https://github.com/beibei030/bitget-fleet-grid-agent |
| Demo | https://beibei030.github.io/bitget-fleet-grid-agent/ |
| Paper CSV | https://raw.githubusercontent.com/beibei030/bitget-fleet-grid-agent/main/submit/paper-trading.csv |
| 回测报告 | https://github.com/beibei030/bitget-fleet-grid-agent/blob/main/submit/backtest-report.md |

## Paper 日志

GitHub 直链：`submit/paper-trading.csv`

## 策略说明（200字内）

Bitget Fleet Grid Agent 将 VPS 实盘 Decibel 8083 舰队网格（22 格、±2.4%、5x）移植到 Bitget USDT 永续。Agent 通过 MCP 拉取 4H K 线与资金费率，用 EMA/ADX/RSI 判断震荡或趋势：震荡时铺中性双边网格，上涨仅挂买单，下跌仅挂卖单，信号不足则空仓。回测与 Paper 均基于 Bitget 真实行情，输出 CSV 审计日志；Live Demo 通过 Agent Hub 在 Demo Trading 挂单。一条命令 `npm run submit:prepare` 可复现全部材料。

## 回测报告

`submit/backtest-report.md`

## 核心数据

- Paper 7天 SOL：+3.0%（117 笔）
- Python 30天 SOL：+21.47%
- Agent 自适应 30天：+0.73 USDT（多数时间 flat 避险）

## 复现

```bash
git clone https://github.com/beibei030/bitget-fleet-grid-agent.git
cd bitget-fleet-grid-agent
npm install
npm run submit:prepare
```
