# 一键打开提交表单并复制文案到剪贴板
$text = @"
=== Bitget Hackathon 表单文案（复制粘贴）===

团队名称: Bitget Fleet Grid Agent
队长报名 UID: 【请填写你的 Bitget UID】
队长联系方式: 【请填写 TG/邮箱】
成员背景: Web3 & AI 开发者
了解渠道: Bitget 官方 Tg 社群

--- 第2页 项目信息 ---

项目名称: Bitget Fleet Grid Agent
参赛赛道: 赛道一 · 交易 Agent
GitHub: https://github.com/beibei030/bitget-fleet-grid-agent
Demo: https://beibei030.github.io/bitget-fleet-grid-agent/
Paper 日志: https://raw.githubusercontent.com/beibei030/bitget-fleet-grid-agent/main/submit/paper-trading.csv
回测报告: https://github.com/beibei030/bitget-fleet-grid-agent/blob/main/submit/backtest-report.md

策略说明:
Bitget Fleet Grid Agent 将 VPS 实盘 Decibel 8083 舰队网格（22 格、±2.4%、5x）移植到 Bitget USDT 永续。Agent 通过 MCP 拉取 4H K 线与资金费率，用 EMA/ADX/RSI 判断震荡或趋势：震荡时铺中性双边网格，上涨仅挂买单，下跌仅挂卖单，信号不足则空仓。回测与 Paper 均基于 Bitget 真实行情，输出 CSV 审计日志；Live Demo 通过 Agent Hub 在 Demo Trading 挂单。一条命令 npm run submit:prepare 可复现全部材料。
"@

Set-Clipboard -Value $text
Write-Host "已复制表单文案到剪贴板"
Start-Process "https://forms.gle/GDQNx5TnCBvYuPin9"
