@echo off
setlocal
set FOUND=0
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8766" ^| findstr "LISTENING"') do (
  taskkill /f /pid %%a >nul 2>nul
  set FOUND=1
)
if "%FOUND%"=="1" (
  echo Service on port 8766 stopped.
) else (
  echo Nothing is running on port 8766.
)
timeout /t 2 >nul
