@echo off
cd /d "%~dp0"
title ColorWheel Picker

where python >nul 2>nul
if errorlevel 1 (
  echo.
  echo   [ERROR] Python was not found in PATH.
  echo.
  echo   Option A: double-click  dist\shuanghuan.html  ^(no Python needed^)
  echo   Option B: install Python 3.12, then run this file again.
  echo.
  pause
  exit /b 1
)

echo Starting local service, your browser will open in a second...
echo Close this window to stop it.
echo.
python -m colorpick --open

if errorlevel 1 pause
