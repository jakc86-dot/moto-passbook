. "$PSScriptRoot\android-local-build-common.ps1"

$projectRoot = Get-ProjectRoot
Set-Location $projectRoot

Write-Host "Checking Java/keytool..."
$javaHome = Use-JavaHome
Write-Host "JAVA_HOME: $javaHome"

$keytool = Get-Command keytool.exe -ErrorAction SilentlyContinue
if (-not $keytool) {
  throw "keytool.exe was not found. Install Android Studio or JDK 17+, then run this again."
}

$keystoreDir = Join-Path $projectRoot "secrets\android"
$keystore = Join-Path $keystoreDir "upload-key.jks"
$signingFile = Join-Path $keystoreDir "local-signing.properties"
$androidKeystore = Join-Path $projectRoot "android\app\keystores\upload-key.jks"
$androidSigningFile = Join-Path $projectRoot "android\local-signing.properties"

if (Test-Path $keystore) {
  throw "Keystore already exists: $keystore"
}

New-Item -ItemType Directory -Force -Path $keystoreDir | Out-Null

$alias = Read-Host "Key alias [upload]"
if (-not $alias) {
  $alias = "upload"
}

$storePasswordSecure = Read-Host "Store password" -AsSecureString
$keyPasswordSecure = Read-Host "Key password, press Enter to reuse store password" -AsSecureString
$storePassword = ConvertFrom-SecureStringPlainText $storePasswordSecure
$keyPassword = ConvertFrom-SecureStringPlainText $keyPasswordSecure
if (-not $keyPassword) {
  $keyPassword = $storePassword
}

if (-not $storePassword -or $storePassword.Length -lt 6) {
  throw "Store password must be at least 6 characters."
}
if ($keyPassword.Length -lt 6) {
  throw "Key password must be at least 6 characters."
}

& $keytool.Source -genkeypair -v -storetype JKS -keystore $keystore -alias $alias -keyalg RSA -keysize 2048 -validity 10000 -storepass $storePassword -keypass $keyPassword -dname "CN=Moto Passbook, OU=Moto Passbook, O=Moto Passbook, L=Seoul, ST=Seoul, C=KR"
if ($LASTEXITCODE -ne 0) {
  exit $LASTEXITCODE
}

@"
storeFile=keystores/upload-key.jks
storePassword=$storePassword
keyAlias=$alias
keyPassword=$keyPassword
"@ | Set-Content -Path $signingFile -Encoding UTF8

Write-Host ""
Write-Host "Keystore created:"
Write-Host $keystore
Write-Host "Local signing properties created:"
Write-Host $signingFile
if (Test-Path (Join-Path $projectRoot "android")) {
  New-Item -ItemType Directory -Force -Path (Split-Path $androidKeystore -Parent) | Out-Null
  Copy-Item -LiteralPath $keystore -Destination $androidKeystore -Force
  Copy-Item -LiteralPath $signingFile -Destination $androidSigningFile -Force
  Write-Host "Copied signing files into android build directory."
}
Write-Host "Do not share these files."
