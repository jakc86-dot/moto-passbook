@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook Android Store AAB build
echo ==========================================
echo.
echo This starts an EAS production build for Google Play.
echo Use this after the test APK build works.
echo.

call npm.cmd run typecheck
if errorlevel 1 (
  echo.
  echo Type check failed. Fix the error above before building.
  pause
  exit /b 1
)

call npm.cmd run export:android
if errorlevel 1 (
  echo.
  echo Android bundle export failed. Fix the error above before building.
  pause
  exit /b 1
)

call npm.cmd run build:android:store
echo.
pause
