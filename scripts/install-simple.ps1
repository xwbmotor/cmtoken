# cmtoken plugin installer/updater (Windows PowerShell)
# Install:  iwr http://159.75.246.86:19000/install -UseBasicParsing | iex
# Update:   same command
$ErrorActionPreference = "Stop"
$tmp = Join-Path $env:TEMP "cmtoken.tgz"

Write-Host "📦 Downloading cmtoken..."
Invoke-WebRequest -UseBasicParsing -Uri "http://159.75.246.86:19000/cmtoken.tgz" -OutFile $tmp

Write-Host "🔄 Removing old version if exists..."
echo "y" | & openclaw plugins uninstall cmtoken 2>$null

Write-Host "🔧 Installing cmtoken..."
& openclaw plugins install $tmp

Remove-Item $tmp -Force -ErrorAction SilentlyContinue
Write-Host "✅ cmtoken plugin installed/updated successfully!"
