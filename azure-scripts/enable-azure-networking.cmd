@echo off
REM ============================================================
REM Quick launcher for Azure Networking Enable Script
REM Double-click this file to run the PowerShell script
REM ============================================================

echo.
echo ========================================
echo   Enabling Azure Networking Access
echo ========================================
echo.

REM Get the directory where this script is located
set SCRIPT_DIR=%~dp0

REM Run the PowerShell script
powershell -ExecutionPolicy Bypass -File "%SCRIPT_DIR%enable-azure-networking.ps1"

echo.
pause
