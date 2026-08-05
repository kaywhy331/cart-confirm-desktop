@echo off
setlocal
cd /d "%~dp0"
call npm run verify
if errorlevel 1 (
  echo Verification failed.
  pause
  exit /b 1
)
echo Verification passed.
pause
