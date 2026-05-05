# cmtoken plugin installer/updater for OpenClaw
# Windows PowerShell entry point
# Usage: powershell -ExecutionPolicy Bypass -Command "iwr http://159.75.246.86:19000/install.ps1 -UseBasicParsing | iex"

$Server = "http://159.75.246.86:19000"
$PkgName = "cmtoken.tgz"
$PluginName = "cmtoken"

function Find-OpenClaw {
    $oc = Get-Command openclaw -ErrorAction SilentlyContinue
    if ($oc) { return $oc.Source }
    $paths = @(
        "$env:USERPROFILE\.local\bin\openclaw.exe",
        "$env:USERPROFILE\.local\bin\openclaw.cmd",
        "$env:LOCALAPPDATA\openclaw\openclaw.exe",
        "C:\Program Files\openclaw\openclaw.exe"
    )
    foreach ($p in $paths) {
        if (Test-Path $p) { return $p }
    }
    # Try pnpm global
    $pnpmBin = pnpm bin -g 2>$null
    if ($pnpmBin) {
        $ocPath = Join-Path $pnpmBin "openclaw"
        if (Test-Path $ocPath) { return $ocPath }
    }
    return $null
}

# Find openclaw
$oc = Find-OpenClaw
if (-not $oc) {
    Write-Host "[ERROR] openclaw not found. Please install OpenClaw first." -ForegroundColor Red
    exit 1
}
Write-Host "[INFO] Found openclaw: $oc" -ForegroundColor Green

# Download
$tmpFile = Join-Path $env:TEMP $PkgName
Write-Host "[INFO] Downloading latest $PkgName..." -ForegroundColor Green
try {
    Invoke-WebRequest -Uri "$Server/$PkgName" -OutFile $tmpFile -UseBasicParsing
} catch {
    Write-Host "[ERROR] Failed to download: $_" -ForegroundColor Red
    exit 1
}

# Check if installed -> update or install
$installed = & $oc plugins list 2>$null | Select-String -Pattern $PluginName -Quiet
if ($installed) {
    Write-Host "[INFO] Plugin '$PluginName' already installed. Updating..." -ForegroundColor Yellow
    & $oc plugins uninstall $PluginName 2>$null
}

Write-Host "[INFO] Installing plugin '$PluginName'..." -ForegroundColor Green
& $oc plugins install $tmpFile

if ($LASTEXITCODE -eq 0) {
    Write-Host "[INFO] Plugin '$PluginName' installed/updated successfully!" -ForegroundColor Green
} else {
    Write-Host "[WARN] Install may have issues. Please verify manually." -ForegroundColor Yellow
}

Remove-Item $tmpFile -Force -ErrorAction SilentlyContinue
