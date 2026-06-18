@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook build readiness check
echo ==========================================
echo.

call npm.cmd run typecheck
if errorlevel 1 goto failed

call npm.cmd run export:android
if errorlevel 1 goto failed

call npm.cmd run export:ios
if errorlevel 1 goto failed

echo.
echo Build readiness check finished.
echo Android/iOS JavaScript bundles were created successfully.
pause
exit /b 0

:failed
echo.
echo Check failed. Read the message above.
pause
exit /b 1
