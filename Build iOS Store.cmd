@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook iOS Store build
echo ==========================================
echo.
echo This starts an EAS production build for App Store/TestFlight.
echo Expo may ask for your Expo and Apple developer account login.
echo.

call npm.cmd run typecheck
if errorlevel 1 (
  echo.
  echo Type check failed. Fix the error above before building.
  pause
  exit /b 1
)

call npm.cmd run build:ios:store
echo.
pause
