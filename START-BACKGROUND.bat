@echo off
cd /d "%~dp0"
start "ABDULKAREM AI X Background" powershell.exe -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%~dp0BACKGROUND-RUNTIME.ps1"
exit /b 0
