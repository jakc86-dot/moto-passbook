. "$PSScriptRoot\android-local-build-common.ps1"

$projectRoot = Get-ProjectRoot
Set-Location $projectRoot

Write-Host "Checking local Android build tools..."
$javaHome = Use-JavaHome
Write-Host "JAVA_HOME: $javaHome"
$androidSdk = Use-AndroidSdk
Write-Host "ANDROID_HOME: $androidSdk"

Write-Host ""
Write-Host "Running TypeScript check..."
& npm.cmd run typecheck
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Creating/updating native Android project..."
& npx.cmd expo prebuild --platform android --no-install
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

Ensure-AndroidSigningPatch -ProjectRoot $projectRoot
Test-UploadSigningFiles -ProjectRoot $projectRoot

Write-Host ""
Write-Host "Building release Android App Bundle..."
Set-Location (Join-Path $projectRoot "android")
& .\gradlew.bat bundleRelease
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

$aab = Join-Path $projectRoot "android\app\build\outputs\bundle\release\app-release.aab"
if (Test-Path $aab) {
  Write-Host ""
  Write-Host "AAB created:"
  Write-Host $aab
} else {
  throw "Gradle finished but app-release.aab was not found."
}
