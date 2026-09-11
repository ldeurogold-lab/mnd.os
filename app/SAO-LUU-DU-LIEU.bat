@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0SAO-LUU-DU-LIEU.ps1"
echo.
pause
