@echo off
cd /d "%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0KIEM-TRA-PHUC-HOI.ps1"
echo.
pause
