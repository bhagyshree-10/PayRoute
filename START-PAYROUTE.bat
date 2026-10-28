@echo off
setlocal
title PayRoute Launcher
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\start-payroute.ps1"
echo.
pause
