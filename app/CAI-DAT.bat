@echo off
cd /d "%~dp0"
title CAI DAT MAI NHA DEP OS
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0CAI-DAT-MAI-NHA-DEP-OS.ps1"
echo.
echo Nhan phim bat ky de dong cua so...
pause >nul
