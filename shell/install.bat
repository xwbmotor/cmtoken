@echo off
:: ==============================================================================
:: CMToken & Tuken — OpenClaw Windows One-Click Auto-Deployer
:: ==============================================================================
::
:: Usage:
::   install.bat --bot-token YOUR_TEMP_TOKEN --exchange-url YOUR_EXCHANGE_URL [--pack-url YOUR_PACK_URL]
::
:: ==============================================================================

setlocal enabledelayedexpansion

:: Parse Arguments
set "TOKEN="
set "EXCHANGE_URL="
set "PACK_URL="

:loop
if "%~1"=="" goto after_loop
if "%~1"=="--bot-token" (
    set "TOKEN=%~2"
    shift
)
if "%~1"=="--exchange-url" (
    set "EXCHANGE_URL=%~2"
    shift
)
if "%~1"=="--pack-url" (
    set "PACK_URL=%~2"
    shift
)
shift
goto loop
:after_loop

if "%TOKEN%"=="" (
    echo [ERROR] Missing required parameter --bot-token.
    echo.
    echo Usage:
    echo   install.bat --bot-token YOUR_TEMP_TOKEN --exchange-url YOUR_EXCHANGE_URL
    echo.
    pause
    exit /b 1
)

if "%EXCHANGE_URL%"=="" (
    echo [ERROR] Missing required parameter --exchange-url.
    echo.
    echo Usage:
    echo   install.bat --bot-token YOUR_TEMP_TOKEN --exchange-url YOUR_EXCHANGE_URL
    echo.
    pause
    exit /b 1
)

echo [INFO] Starting native Windows deployment and activation...
echo [INFO] Resolving environment and launching PowerShell...
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" -BotToken "%TOKEN%" -ExchangeUrl "%EXCHANGE_URL%" -PackUrl "%PACK_URL%"

if %errorlevel% neq 0 (
    echo.
    echo [ERROR] Installation failed! Please check logs.
    pause
    exit /b %errorlevel%
)

pause
