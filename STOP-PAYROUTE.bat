@echo off
setlocal
title PayRoute Shutdown
cd /d "%~dp0"
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\stop-payroute.ps1"
echo.
pause
