@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Please install Node.js 24 or newer, then run this file again.
  pause
  exit /b 1
)
if not exist "node_modules\vite\bin\vite.js" (
  echo Installing CareClaim dependencies...
  call npm.cmd ci
  if errorlevel 1 (
    echo Installation failed. Check your internet connection and try again.
    pause
    exit /b 1
  )
)
echo.
echo CareClaim starts at http://127.0.0.1:5173
echo Select Member, Hospital staff, Claim officer, or Administrator to explore.
echo Keep this window open. Press Ctrl+C to stop both servers.
echo.
call npm.cmd run dev
pause
