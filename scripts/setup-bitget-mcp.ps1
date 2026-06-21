# Bitget MCP + Live Demo 配置
param([switch]$LoadEnv)
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$EnvFile = Join-Path $Root ".env"
Write-Host "=== Bitget Fleet Grid MCP ===" -ForegroundColor Cyan
if ($LoadEnv -and (Test-Path $EnvFile)) {
  Get-Content $EnvFile | ForEach-Object {
    if ($_ -match '^\s*([^#=]+)=(.*)$') {
      [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim().Trim('"'), "Process")
    }
  }
}
Write-Host "MCP: $Root\.cursor\mcp.json"
Write-Host "下一步: 重启 Cursor → npm run live:demo"
