# Bitget 网格 Live Demo（Agent Hub MCP）

通过 Bitget Agent Hub MCP 在 **Demo Trading（模拟盘）** 上运行 VPS 同源中性网格。

## 何时使用

- 用户要求 live demo、实盘演示、MCP 接入
- 需要在 Bitget Demo 账户挂网格限价单
- 通过 Cursor 自然语言驱动 Bitget 交易 API

## 前置条件

1. 在 [bitget.com → API 管理](https://www.bitget.com/account/newapi) 创建 **Demo Trading API Key**（Read + Trade）
2. 设置环境变量（三者缺一不可）：

```powershell
$env:BITGET_API_KEY = "your-demo-key"
$env:BITGET_SECRET_KEY = "your-secret"
$env:BITGET_PASSPHRASE = "your-passphrase"
```

3. Cursor 已配置 MCP（项目根 `.cursor/mcp.json` 含 `bitget-mcp-server --paper-trading`）
4. **重启 Cursor** 使 MCP 生效

## MCP 工具映射

| 步骤 | MCP Tool | 说明 |
| --- | --- | --- |
| 查价 | `futures_get_ticker` | productType=USDT-FUTURES |
| 查余额 | `account_get_balance` | Demo 账户 USDT |
| 查持仓 | `futures_get_positions` | 当前合约持仓 |
| 设杠杆 | `futures_set_leverage` | 默认 5x（VPS 同源） |
| 挂单 | `futures_place_order` | POST_ONLY limit，orders 数组 |
| 查挂单 | `futures_get_pending_orders` | 验证铺单 |
| 撤单 | `futures_cancel_orders` | cancelAll=true |

## 网格参数（VPS Decibel 8083 同源）

- 22 格 / ±2.4% 半宽 / 5x 杠杆 / 85% 预算
- Demo 默认每侧最多 4 单（`--max-orders 4`），避免一次挂太多

## CLI 演示（与 MCP 同源 bgc）

```bash
cd hackathon/bitget-adaptive-grid

# dry-run：只看计划
npm run live:demo

# Demo Trading 真实挂单
npm run live:demo -- --execute --symbol SOLUSDT --cancel-first
```

## Agent 自然语言 Demo 流程

1. 调用 `futures_get_ticker` 获取 SOLUSDT 现价
2. 按 `gridPlanner.ts` 逻辑计算 lower/upper 和买卖档位
3. 调用 `futures_set_leverage` 设为 5x
4. 调用 `futures_place_order` 提交 post_only 限价单（先 `--max-orders 4` 演示）
5. 调用 `futures_get_pending_orders` 截图/日志验证
6. 输出 `logs/live-demo-*.json`

## 安全

- MCP 配置使用 `--paper-trading`，不会操作真实资金账户
- 不加 `--execute` 时脚本仅 dry-run
- 真实账户需去掉 `--paper-trading`（不推荐黑客松演示）
