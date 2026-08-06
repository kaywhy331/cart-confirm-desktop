@echo off
setlocal
cd /d "%~dp0"

echo.
echo Cart Confirm - Windows build
echo ============================

where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js is not installed or is not available in PATH.
  pause
  exit /b 1
)

call npm ci --no-fund
if errorlevel 1 goto :failure

call npm run verify
if errorlevel 1 goto :failure

call npm run dist:win
if errorlevel 1 goto :failure

echo.
echo Build complete. Installers are in the dist folder.
pause
exit /b 0

:failure
echo.
echo Build failed. Review the messages above.
pause
exit /b 1
