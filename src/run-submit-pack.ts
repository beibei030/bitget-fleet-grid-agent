#!/usr/bin/env node
/** 一键生成黑客松提交材料 → submit/ */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execSync } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const SUBMIT = path.join(ROOT, "submit");
const DEMO_DATA = path.join(ROOT, "demo", "data.json");

function run(cmd: string) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { cwd: ROOT, stdio: "inherit", shell: true });
}

function copy(src: string, dest: string) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function latest(dir: string, prefix: string) {
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir).filter((f) => f.startsWith(prefix)).sort();
  return files.at(-1) ? path.join(dir, files.at(-1)!) : null;
}

async function main() {
  console.log("=== Bitget Fleet Grid — 提交材料打包 ===\n");

  run("npm run backtest");
  run("npm run paper");
  run("npm run agent:backtest");
  run("npm run agent:grid -- --symbol SOLUSDT");
  run("npm run agent:grid -- --symbol BTCUSDT");
  run("npm run agent:grid -- --symbol ETHUSDT");

  try {
    run("python backtest/run_backtest.py");
  } catch {
    console.log("Python 回测跳过（需 pip install -r requirements.txt）");
  }

  fs.rmSync(SUBMIT, { recursive: true, force: true });
  fs.mkdirSync(SUBMIT, { recursive: true });

  const artifacts = [
    [latest(path.join(ROOT, "reports"), "backtest-"), "backtest-report.md"],
    [latest(path.join(ROOT, "reports"), "backtest-")?.replace(".md", ".json"), "backtest-report.json"],
    [latest(path.join(ROOT, "reports"), "agent-backtest-"), "agent-backtest.md"],
    [latest(path.join(ROOT, "logs"), "paper-"), "paper-trading.csv"],
    [latest(path.join(ROOT, "logs"), "paper-")?.replace(".csv", ".json"), "paper-trading.json"],
    [latest(path.join(ROOT, "logs"), "agent-SOLUSDT"), "agent-decision-SOLUSDT.json"],
    [path.join(ROOT, "backtest/results/metrics.json"), "python-backtest-metrics.json"],
    [path.join(ROOT, "backtest/results/trades.csv"), "python-backtest-trades.csv"],
  ] as const;

  for (const [src, name] of artifacts) {
    if (src && fs.existsSync(src)) {
      copy(src, path.join(SUBMIT, name));
      console.log(`  ✓ ${name}`);
    }
  }

  const paperJson = fs.existsSync(path.join(SUBMIT, "paper-trading.json"))
    ? JSON.parse(fs.readFileSync(path.join(SUBMIT, "paper-trading.json"), "utf8"))
    : {};
  const pyMetrics = fs.existsSync(path.join(SUBMIT, "python-backtest-metrics.json"))
    ? JSON.parse(fs.readFileSync(path.join(SUBMIT, "python-backtest-metrics.json"), "utf8"))
    : {};
  const agentMd = fs.existsSync(path.join(SUBMIT, "agent-backtest.md"))
    ? fs.readFileSync(path.join(SUBMIT, "agent-backtest.md"), "utf8")
    : "";

  const demoPayload = {
    generatedAt: new Date().toISOString(),
    project: "Bitget Fleet Grid Agent",
    track: "Track 1 — Trading Agent",
    paper: {
      symbol: paperJson.symbol ?? "SOLUSDT",
      netPnl: paperJson.netPnl,
      returnPct: paperJson.netPnl && paperJson.startBalance ? (paperJson.netPnl / paperJson.startBalance) * 100 : null,
      trades: paperJson.trades?.length ?? 0,
      roundTrips: paperJson.roundTrips,
    },
    pythonBacktest: pyMetrics.metrics ?? pyMetrics,
    agentBacktestExcerpt: agentMd.split("\n").slice(0, 20),
    gridParams: { gridCount: 22, rangeHalfPct: 0.024, leverage: 5 },
  };

  fs.writeFileSync(DEMO_DATA, JSON.stringify(demoPayload, null, 2));
  fs.writeFileSync(
    path.join(ROOT, "demo", "data.js"),
    `window.DEMO_DATA = ${JSON.stringify(demoPayload, null, 2)};`
  );
  copy(DEMO_DATA, path.join(SUBMIT, "demo-data.json"));

  const summary = `# 提交材料摘要

生成时间：${demoPayload.generatedAt}

## 核心亮点

1. **VPS 实盘网格移植**：Decibel 8083 舰队参数（22格/±2.4%/5x）
2. **Agent 自适应**：Bitget MCP 4H K线 + 资金费率 → 自动切换 neutral/long/short/flat
3. **可复现**：\`npm run submit:prepare\` 一键生成全部材料

## Paper Trading（SOL 7天）

- 净利：${paperJson.netPnl?.toFixed?.(2) ?? "?"} USDT
- 成交：${paperJson.trades?.length ?? "?"} 笔

## 文件清单

| 文件 | 用途 |
| --- | --- |
| paper-trading.csv | 表单 Paper 日志链接 |
| backtest-report.md | 回测报告 |
| agent-backtest.md | Agent 自适应回测 |
| agent-decision-SOLUSDT.json | Agent 决策审计 |
| python-backtest-metrics.json | Python 交叉验证 |

## 表单填写

- 赛道：交易 Agent
- GitHub：本仓库 public 链接
- Paper 日志：\`submit/paper-trading.csv\`
- 回测：\`submit/backtest-report.md\`
- Demo：\`demo/index.html\`（本地打开或 GitHub Pages）
`;

  fs.writeFileSync(path.join(SUBMIT, "SUMMARY.md"), summary);

  const manifest = {
    generatedAt: demoPayload.generatedAt,
    files: fs.readdirSync(SUBMIT),
    reproduce: ["npm install", "npm run submit:prepare"],
  };
  fs.writeFileSync(path.join(SUBMIT, "manifest.json"), JSON.stringify(manifest, null, 2));

  console.log(`\n✅ 提交材料已写入 ${SUBMIT}`);
  console.log("   打开 demo/index.html 查看 Demo 仪表盘");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
