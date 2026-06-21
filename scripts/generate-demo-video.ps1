# Generate demo MP4 via ffmpeg (~50 sec slideshow)
$ErrorActionPreference = "Continue"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Out = Join-Path $Root "demo\BitgetFleetGrid-Demo.mp4"
$Tmp = Join-Path $env:TEMP "bg-demo-frames"
$Font = "C:/Windows/Fonts/msyhbd.ttc"
if (-not (Test-Path $Font)) { $Font = "C:/Windows/Fonts/arial.ttf" }

Remove-Item -Recurse -Force $Tmp -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path $Tmp | Out-Null

function Make-Scene($index, $duration, [string[]]$lines) {
  $part = Join-Path $Tmp ("scene{0}.mp4" -f $index)
  $filters = @()
  $y = 100
  $fontEsc = "C\\:/Windows/Fonts/msyhbd.ttc"
  if (-not (Test-Path "C:/Windows/Fonts/msyhbd.ttc")) { $fontEsc = "C\\:/Windows/Fonts/arial.ttf" }
  foreach ($line in $lines) {
    $safe = ($line -replace "'","\\'")
    $filters += "drawtext=fontfile=${fontEsc}:text='$safe':fontsize=32:fontcolor=white:x=(w-text_w)/2:y=$y"
    $y += 55
  }
  $vf = $filters -join ","
  & ffmpeg -y -loglevel error -f lavfi -i "color=c=0x0a0e17:s=1280x720:d=$duration" -vf $vf -c:v libx264 -pix_fmt yuv420p -r 24 $part
  if (-not (Test-Path $part)) { throw "Scene $index failed" }
  Write-Host "Scene $index OK"
  return $part
}

$parts = @(
  (Make-Scene 1 5 @("Bitget Fleet Grid Agent", "Hackathon S1 - Trading Agent Track", "VPS Grid x Bitget MCP"))
  (Make-Scene 2 8 @("Why Agent?", "Fixed grid 30d backtest -424 USDT", "Agent adaptive 30d backtest +0.73 U", "Paper 7d SOL +3.0 pct"))
  (Make-Scene 3 10 @("MCP futures_get_candles and ticker", "Signals EMA ADX RSI Funding", "Modes neutral long short flat"))
  (Make-Scene 4 15 @("npm run agent-grid SOLUSDT", "Result BULL long grid 94.5 pct", "4 post_only buy orders below price", "Audit log agent-SOLUSDT json"))
  (Make-Scene 5 10 @("Reproduce on GitHub", "beibei030/bitget-fleet-grid-agent", "npm install and npm run submit prepare"))
  (Make-Scene 6 5 @("Demo Video online", "beibei030.github.io/bitget-fleet-grid-agent/video.html"))
)

$list = Join-Path $Tmp "list.txt"
($parts | ForEach-Object { "file '$($_.Replace('\','/'))'" }) | Set-Content -Encoding ascii $list
& ffmpeg -y -loglevel error -f concat -safe 0 -i $list -c copy $Out
Remove-Item -Recurse -Force $Tmp
Remove-Item -Force (Join-Path $Root "demo\test-scene.mp4") -ErrorAction SilentlyContinue

if (Test-Path $Out) {
  $mb = [math]::Round((Get-Item $Out).Length / 1MB, 2)
  Write-Host "Done: $Out ($mb MB)"
} else { exit 1 }
