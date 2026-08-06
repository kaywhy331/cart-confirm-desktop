@echo off
setlocal
cd /d "%~dp0"

echo.
echo Cart Confirm - Windows launcher
echo ================================

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not available in PATH.
  echo Install the current Node.js LTS release, then run this file again.
  pause
  exit /b 1
)

if not exist "node_modules\electron\package.json" (
  echo Installing desktop dependencies...
  call npm ci --no-fund
  if errorlevel 1 (
    echo.
    echo ERROR: Dependency installation failed.
    pause
    exit /b 1
  )
)

echo Starting Cart Confirm...
call npm start
if errorlevel 1 (
  echo.
  echo Cart Confirm exited with an error.
  pause
  exit /b 1
)
