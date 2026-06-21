# Bitget Fleet Grid Agent

[![Hackathon](https://img.shields.io/badge/Bitget-Hackathon%20S1-blue)](https://forms.gle/GDQNx5TnCBvYuPin9)
[![Track](https://img.shields.io/badge/Track-Trading%20Agent-green)](https://bitget-ai.gitbook.io/hackathon)

> **VPS 实盘舰队网格 + Bitget MCP 趋势 Agent** — 震荡铺网、趋势顺势、不确定空仓

将 Decibel 8083 上运行的 **22 格 / ±2.4% / 5x** 舰队网格移植到 Bitget USDT 永续，并通过 **Bitget Agent Hub MCP** 接入 4H K 线与资金费率，由 Agent 自动在 **中性 / 做多 / 做空 / 空仓** 四种模式间切换。

## 为什么值得看

| 亮点 | 说明 |
| --- | --- |
| 真实生产逻辑 | 参数来自 VPS `DEC_CRYPTO_GRID`，非纸上参数 |
| Agent 闭环 | MCP 感知 → 趋势规则 → 网格执行，非固定中性 |
| 评委可复现 | 一条命令生成 Paper CSV + 回测报告 + Agent 决策日志 |
| Bitget 原生 | 公开 K 线 API + `bitget-mcp-server` Demo 挂单 |

## 架构

```
Bitget MCP (K线/费率/Ticker)
        ↓
  trendAnalyzer (EMA/ADX/RSI)
        ↓
  gridPlanner (neutral|long|short|flat)
        ↓
  Paper CSV / Demo Trading 挂单
```

## 快速开始（评委 3 分钟）

```bash
git clone <your-repo>
cd BG黑客松   # 或仓库根目录
npm install
npm run submit:prepare    # 生成 submit/ 全部材料
```

浏览器打开 `demo/index.html` 查看仪表盘（需先运行 `submit:prepare` 生成 `demo/data.json`）。

### 分步命令

```bash
npm run all                 # 三标的回测 + Paper CSV
npm run agent:grid          # Agent 趋势决策 + 网格计划
npm run agent:backtest      # 自适应分段回测
python backtest/run_backtest.py   # Python 交叉验证（可选）
```

### Live Demo（需 Demo API Key）

```bash
copy .env.example .env      # 填入 Bitget Demo Trading Key
npm run agent:grid -- --execute --symbol SOLUSDT
```

## 提交材料（`submit/` 目录）

| 文件 | 黑客松表单 |
| --- | --- |
| `paper-trading.csv` | Paper / 模拟交易日志 **必填** |
| `backtest-report.md` | 回测报告 + 复现代码 |
| `agent-backtest.md` | Agent 自适应回测 |
| `agent-decision-SOLUSDT.json` | Agent 决策审计 |
| `SUMMARY.md` | 材料索引 |

## 策略参数

| 参数 | 值 |
| --- | --- |
| 格数 | 22 |
| 半宽 | ±2.4% |
| 杠杆 | 5x |
| 标的 | BTC / ETH / SOL |
| Maker 费 | 0.02% |

## Agent 模式

| 状态 | 网格 | 挂单 |
| --- | --- | --- |
| RANGE | neutral | 双边 |
| BULL | long | 仅买单 |
| BEAR | short | 仅卖单 |
| UNCLEAR | flat | 空仓 |

## 目录

```
├── src/           # TS 引擎（回测/Agent/Live Demo）
├── bitget_grid/   # Python 网格
├── submit/        # 一键生成的提交材料
├── demo/          # 静态 Demo 页
├── reports/       # 回测报告
├── logs/          # Paper + Agent 日志
└── docs/          # SUBMISSION.md, AGENT.md
```

## Bitget 工具

- [Agent Hub MCP](https://github.com/BitgetLimited/agent_hub) — `futures_get_candles`, `futures_place_order`
- 公开 API — `api.bitget.com/api/v2/mix/market/*`

## 提交

- 表单：https://forms.gle/GDQNx5TnCBvYuPin9
- 仓库：https://github.com/beibei030/bitget-fleet-grid-agent
- Demo：https://beibei030.github.io/bitget-fleet-grid-agent/
- 详情：`docs/SUBMISSION.md`

## License

MIT
