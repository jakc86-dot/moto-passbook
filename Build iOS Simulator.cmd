@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook iOS Simulator build
echo ==========================================
echo.
echo This starts an EAS internal build for the iOS simulator.
echo Use this for quick iPhone simulator testing before App Store builds.
echo.

call npm.cmd run typecheck
if errorlevel 1 (
  echo.
  echo Type check failed. Fix the error above before building.
  pause
  exit /b 1
)

call npm.cmd run build:ios:simulator
echo.
pause
