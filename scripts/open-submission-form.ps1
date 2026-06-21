# Open Bitget Hackathon submission form and copy fill text to clipboard
$lines = @(
  "=== Bitget Hackathon Form Text ===",
  "",
  "Team: Bitget Fleet Grid Agent",
  "Bitget UID: [YOUR UID HERE]",
  "Contact: [YOUR TG OR EMAIL]",
  "Background: Web3 and AI Developer",
  "Source: Bitget Official Telegram",
  "",
  "Project: Bitget Fleet Grid Agent",
  "Track: Trading Agent (Track 1)",
  "GitHub: https://github.com/beibei030/bitget-fleet-grid-agent",
  "Demo: https://beibei030.github.io/bitget-fleet-grid-agent/",
  "Paper CSV: https://raw.githubusercontent.com/beibei030/bitget-fleet-grid-agent/main/submit/paper-trading.csv",
  "Backtest: https://github.com/beibei030/bitget-fleet-grid-agent/blob/main/submit/backtest-report.md",
  "",
  "Strategy (CN):",
  "Bitget Fleet Grid Agent ports VPS Decibel 8083 fleet grid (22 levels, +/-2.4%, 5x) to Bitget USDT perpetual. Agent uses MCP for 4H candles and funding rate, EMA/ADX/RSI for regime: neutral grid in range, long grid in bull, short grid in bear, flat when unclear. Paper and backtest use real Bitget data with CSV audit logs. Live demo via Agent Hub on Demo Trading. Reproduce: npm run submit:prepare"
)
$text = $lines -join "`n"
Set-Clipboard -Value $text
Write-Host "Copied form text to clipboard."
Start-Process "https://forms.gle/GDQNx5TnCBvYuPin9"
