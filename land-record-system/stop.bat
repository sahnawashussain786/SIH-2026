@echo off
title Land Record System - Stop
cd /d "%~dp0"

echo.
echo   Stopping all Land Record System services...
echo.
node scripts/dev.mjs --stop
echo.
pause
