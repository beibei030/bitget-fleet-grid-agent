# Bitget Hackathon S1 — 提交包

## 赛道

**赛道一 · 交易 Agent**

## 提交入口

https://forms.gle/GDQNx5TnCBvYuPin9

---

## 一键生成材料

```bash
npm install
npm run submit:prepare
```

输出目录：`submit/`

---

## 表单填写参考

### 项目名

**Bitget Fleet Grid Agent** — VPS 舰队网格 × MCP 趋势自适应

### GitHub

Public 仓库根目录，README 含 `npm run submit:prepare`

### Demo 链接

- 静态页：`demo/index.html`（GitHub Pages 或 raw 预览）
- 或录屏：`npm run agent:grid` 终端输出

### Paper 日志（必填）

上传或链接：`submit/paper-trading.csv`

含字段：timestamp, symbol, side, price, size, balance, pnl

### 回测报告

`submit/backtest-report.md` + 复现命令 `npm run backtest`

### 策略说明（复制到表单，<200 字）

Bitget Fleet Grid Agent 将 VPS 实盘 Decibel 8083 舰队网格（22 格、±2.4%、5x）移植到 Bitget USDT 永续。Agent 通过 MCP 拉取 4H K 线与资金费率，用 EMA/ADX/RSI 判断震荡或趋势：震荡时铺中性双边网格，上涨仅挂买单，下跌仅挂卖单，信号不足则空仓。回测与 Paper 均基于 Bitget 真实行情，输出 CSV 审计日志；Live Demo 通过 Agent Hub 在 Demo Trading 挂单。一条命令可复现全部材料。

### 对 AI Trading 的看法（选填）

Agent 的价值不是替代规则，而是在规则之上做 **情境切换**：网格适合震荡，趋势适合顺势减暴露。MCP 让 Agent 能读真实交易所数据并审计每一步决策，这比黑盒 LLM 下单更适合生产。

---

## 材料清单

| 文件 | 状态 |
| --- | --- |
| `submit/paper-trading.csv` | Paper 日志 |
| `submit/backtest-report.md` | 30 天三标的回测 |
| `submit/agent-backtest.md` | Agent 自适应回测 |
| `submit/agent-decision-SOLUSDT.json` | Agent 决策 |
| `submit/python-backtest-metrics.json` | Python 交叉验证 |
| `demo/index.html` | 静态 Demo |

---

## 提交前检查

- [ ] `.env` 未提交
- [ ] `.cursor/mcp.json` 无硬编码 Key
- [ ] `npm run submit:prepare` 已跑通
- [ ] GitHub 仓库 public
- [ ] Bitget UID 与报名一致
