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
echo   All services stopped. Press any key to close.
pause > nul
