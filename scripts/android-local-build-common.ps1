$ErrorActionPreference = "Stop"

function Get-ProjectRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Find-JavaHome {
  $candidates = @()
  if ($env:JAVA_HOME) {
    $candidates += $env:JAVA_HOME
  }
  $candidates += @(
    "$env:ProgramFiles\Android\Android Studio\jbr",
    "$env:ProgramFiles\Android\Android Studio\jre",
    "$env:ProgramFiles\Eclipse Adoptium",
    "$env:ProgramFiles\Java"
  )

  foreach ($candidate in $candidates) {
    if (-not $candidate -or -not (Test-Path $candidate)) {
      continue
    }
    if (Test-Path (Join-Path $candidate "bin\java.exe")) {
      return (Resolve-Path $candidate).Path
    }
    $found = Get-ChildItem -Path $candidate -Recurse -Filter java.exe -ErrorAction SilentlyContinue |
      Where-Object { $_.FullName -match "\\bin\\java\.exe$" } |
      Select-Object -First 1
    if ($found) {
      return (Split-Path (Split-Path $found.FullName -Parent) -Parent)
    }
  }

  $javaCommand = Get-Command java.exe -ErrorAction SilentlyContinue
  if ($javaCommand) {
    return (Split-Path (Split-Path $javaCommand.Source -Parent) -Parent)
  }

  return $null
}

function Use-JavaHome {
  $javaHome = Find-JavaHome
  if (-not $javaHome) {
    throw "Java JDK was not found. Install Android Studio or JDK 17+, then run this again."
  }
  $env:JAVA_HOME = $javaHome
  $env:Path = "$(Join-Path $javaHome "bin");$env:Path"
  return $javaHome
}

function Find-AndroidSdk {
  $candidates = @()
  if ($env:ANDROID_HOME) {
    $candidates += $env:ANDROID_HOME
  }
  if ($env:ANDROID_SDK_ROOT) {
    $candidates += $env:ANDROID_SDK_ROOT
  }
  $candidates += "$env:LOCALAPPDATA\Android\Sdk"

  foreach ($candidate in $candidates) {
    if ($candidate -and (Test-Path $candidate)) {
      return (Resolve-Path $candidate).Path
    }
  }
  return $null
}

function Use-AndroidSdk {
  $sdk = Find-AndroidSdk
  if (-not $sdk) {
    throw "Android SDK was not found. Install Android Studio, open SDK Manager once, then run this again."
  }

  $env:ANDROID_HOME = $sdk
  $env:ANDROID_SDK_ROOT = $sdk
  $platforms = Join-Path $sdk "platforms"
  $buildTools = Join-Path $sdk "build-tools"

  if (-not (Test-Path $platforms) -or -not (Get-ChildItem $platforms -Directory -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    throw "Android SDK platforms are missing. Install Android SDK Platform 35 or newer in Android Studio SDK Manager."
  }
  if (-not (Test-Path $buildTools) -or -not (Get-ChildItem $buildTools -Directory -ErrorAction SilentlyContinue | Select-Object -First 1)) {
    throw "Android SDK Build-Tools are missing. Install Android SDK Build-Tools in Android Studio SDK Manager."
  }

  return $sdk
}

function ConvertFrom-SecureStringPlainText {
  param([Parameter(Mandatory = $true)] [SecureString] $SecureString)
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($SecureString)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr)
  } finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
  }
}

function Ensure-AndroidSigningPatch {
  param([Parameter(Mandatory = $true)] [string] $ProjectRoot)

  $gradleFile = Join-Path $ProjectRoot "android\app\build.gradle"
  if (-not (Test-Path $gradleFile)) {
    throw "android/app/build.gradle was not found. Run expo prebuild first."
  }

  $text = Get-Content $gradleFile -Raw

  if ($text -notmatch "uploadSigningProperties") {
    $projectRootLine = 'def projectRoot = rootDir.getAbsoluteFile().getParentFile().getAbsolutePath()'
    $insert = @'
def uploadSigningProperties = new Properties()
def uploadSigningPropertiesFile = rootProject.file("local-signing.properties")
if (uploadSigningPropertiesFile.exists()) {
    uploadSigningPropertiesFile.withInputStream { uploadSigningProperties.load(it) }
}

'@
    $text = $text.Replace($projectRootLine + "`r`n", $projectRootLine + "`r`n`r`n" + $insert)
  }

  if ($text -notmatch "signingConfigs\.release") {
    $releaseConfig = @'
        release {
            def uploadStoreFile = uploadSigningProperties['storeFile'] ?: System.getenv("MOTO_UPLOAD_STORE_FILE")
            storeFile file(uploadStoreFile ?: "keystores/upload-key.jks")
            storePassword uploadSigningProperties['storePassword'] ?: System.getenv("MOTO_UPLOAD_STORE_PASSWORD") ?: ""
            keyAlias uploadSigningProperties['keyAlias'] ?: System.getenv("MOTO_UPLOAD_KEY_ALIAS") ?: "upload"
            keyPassword uploadSigningProperties['keyPassword'] ?: System.getenv("MOTO_UPLOAD_KEY_PASSWORD") ?: ""
        }
'@
    $text = $text -replace "(?s)(signingConfigs\s*\{\s*debug\s*\{.*?\n\s*\}\r?\n)(\s*\})", "`$1$releaseConfig`r`n`$2"
    $text = $text.Replace("signingConfig signingConfigs.debug", "signingConfig signingConfigs.release")
  }

  Set-Content -Path $gradleFile -Value $text -Encoding UTF8
}

function Test-UploadSigningFiles {
  param([Parameter(Mandatory = $true)] [string] $ProjectRoot)

  $keystore = Join-Path $ProjectRoot "android\app\keystores\upload-key.jks"
  $properties = Join-Path $ProjectRoot "android\local-signing.properties"
  if (-not (Test-Path $keystore) -or -not (Test-Path $properties)) {
    throw "Upload keystore is missing. Run 'Generate Android Upload Keystore.cmd' first."
  }
}
