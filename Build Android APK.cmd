@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook Android APK build
echo ==========================================
echo.
echo This starts an EAS cloud build for an Android APK.
echo If this is your first build, Expo will ask you to log in.
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

call npm.cmd run build:android:apk
echo.
pause
