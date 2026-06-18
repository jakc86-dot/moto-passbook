@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook upload keystore generator
echo ==========================================
echo.
echo This creates android/app/keystores/upload-key.jks for local release builds.
echo Keep this file private. Losing it can block future Play Store updates.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\generate-android-upload-keystore.ps1"
echo.
pause
