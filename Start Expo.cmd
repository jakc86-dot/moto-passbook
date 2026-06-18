@echo off
setlocal

cd /d "%~dp0"
title Moto Passbook - Expo Web

echo.
echo ==========================================
echo  Moto Passbook Expo Web launcher
echo ==========================================
echo.

set "NODE_DIR=C:\Program Files\nodejs"
set "NODE_EXE=%NODE_DIR%\node.exe"
set "NPM_CLI=%NODE_DIR%\node_modules\npm\bin\npm-cli.js"
set "EXPO_CLI=%CD%\node_modules\expo\bin\cli"

if not exist "%NODE_EXE%" (
  echo Node.js was not found on this PC.
  echo.
  echo Please install Node.js LTS first, then double-click this file again.
  echo Opening the Node.js download page...
  start "" "https://nodejs.org/"
  echo.
  pause
  exit /b 1
)

if not exist "%NPM_CLI%" (
  echo npm was not found inside %NODE_DIR%.
  echo.
  echo Please reinstall Node.js LTS, then double-click this file again.
  echo Opening the Node.js download page...
  start "" "https://nodejs.org/"
  echo.
  pause
  exit /b 1
)

if not exist "node_modules" (
  echo Installing app dependencies. This can take a few minutes the first time.
  echo.
  "%NODE_EXE%" "%NPM_CLI%" install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please check the error above.
    pause
    exit /b 1
  )
)

if not exist "%EXPO_CLI%" (
  echo Expo CLI was not found in node_modules.
  echo Reinstalling app dependencies.
  echo.
  "%NODE_EXE%" "%NPM_CLI%" install
  if errorlevel 1 (
    echo.
    echo npm install failed. Please check the error above.
    pause
    exit /b 1
  )
)

echo.
echo Starting Expo Web.
echo.
set "EXPO_PORT=19006"
for /f %%p in ('powershell -NoProfile -ExecutionPolicy Bypass -Command "$listener=[Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback,0); $listener.Start(); $port=$listener.LocalEndpoint.Port; $listener.Stop(); $port"') do set "EXPO_PORT=%%p"

echo Using port %EXPO_PORT%.
echo Opening http://localhost:%EXPO_PORT% in your browser.
echo.
start "" powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -Command "Start-Sleep -Seconds 5; Start-Process 'http://localhost:%EXPO_PORT%'"
"%NODE_EXE%" "%EXPO_CLI%" start --web --clear --port %EXPO_PORT%

echo.
pause
