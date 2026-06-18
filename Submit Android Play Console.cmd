@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook Play Console submit
echo ==========================================
echo.
echo This submits the latest successful Android production build to Google Play.
echo You need access to the Expo project and Google Play Console app.
echo If this is the first submit, EAS may ask for Google service account setup.
echo.

call npm.cmd run typecheck
if errorlevel 1 (
  echo.
  echo Type check failed. Fix the error above before submitting.
  pause
  exit /b 1
)

call npm.cmd run submit:android:latest
echo.
pause
