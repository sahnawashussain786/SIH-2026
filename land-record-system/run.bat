@echo off
title Land Record System - One-Click Launcher
cd /d "%~dp0"

echo.
echo   ================================================
echo    Land Record System - starting all services
echo   ================================================
echo.

node scripts/dev.mjs %*

echo.
echo   All services stopped.
choice /c SR /n /m "   [S]top leftover services  or  [R]estart everything? "
if errorlevel 2 (
  node scripts/dev.mjs
) else (
  node scripts/dev.mjs --stop
)
