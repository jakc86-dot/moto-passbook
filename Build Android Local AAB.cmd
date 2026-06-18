@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo  Moto Passbook local Android AAB build
echo ==========================================
echo.
echo This builds a Play Console .aab on this PC with Gradle.
echo It does not use EAS cloud build.
echo.

powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\build-android-local-aab.ps1"
echo.
pause
