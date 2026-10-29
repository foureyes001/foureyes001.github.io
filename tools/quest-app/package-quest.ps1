# Inside the Cloud - package the Quest app with Meta's Bubblewrap (Windows).
# Build 39: app mode "immersive" - the app opens straight into VR (was 2D, a flat window).
# Run through 1-build.bat and 2-install.bat. You type every password and licence answer.
param([ValidateSet('build','install')][string]$Step = 'build')

$ErrorActionPreference = 'Continue'
$Root     = $PSScriptRoot
$Proj     = Join-Path $Root 'project'
$Log      = Join-Path $Root 'status.log'
$Manifest = 'https://foureyes001.github.io/manifest.json'
$PkgId    = 'io.github.foureyes001.insidethecloud'
$Apk      = Join-Path $Proj 'app-release-signed.apk'
$env:Path = $env:Path + ';' + (Join-Path $env:APPDATA 'npm')

function Say($msg, $color = 'Cyan') {
  Write-Host ''
  Write-Host ('=== ' + $msg) -ForegroundColor $color
  Add-Content -Path $Log -Value ('[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $msg)
}
function Fail($msg) { Say ('FAILED: ' + $msg) 'Red'; Read-Host 'Press Enter to close'; exit 1 }

function Get-BwConfig {
  $p = Join-Path $env:USERPROFILE '.bubblewrap\config.json'
  if (Test-Path $p) { return (Get-Content $p -Raw | ConvertFrom-Json) }
  return $null
}
function Use-Jdk($cfg) {
  if ($cfg -and $cfg.jdkPath -and (Test-Path $cfg.jdkPath)) {
    $env:JAVA_HOME = $cfg.jdkPath
    $env:Path = (Join-Path $cfg.jdkPath 'bin') + ';' + $env:Path
  }
}
function Find-Tool($cfg, $sub, $name) {
  if (-not $cfg -or -not $cfg.androidSdkPath) { return $null }
  $dir = Join-Path $cfg.androidSdkPath $sub
  if (-not (Test-Path $dir)) { return $null }
  return (Get-ChildItem -Path $dir -Recurse -File -Filter $name -ErrorAction SilentlyContinue |
          Sort-Object FullName -Descending | Select-Object -First 1 -ExpandProperty FullName)
}

$SdkRe = '(?m)^([ \t]*)(targetSdkVersion|targetSdk)\b([ \t=]*)\d+'
function Test-TargetSdk32 {
  $app = Join-Path $Proj 'app\build.gradle'
  if (-not (Test-Path $app)) { return $false }
  $m = [regex]::Match([IO.File]::ReadAllText($app), $SdkRe.Replace('\d+', '32\b'))
  return $m.Success
}
function Patch-Gradle {
  $app = Join-Path $Proj 'app\build.gradle'
  if (-not (Test-Path $app)) { Fail 'app\build.gradle not found (look for build.gradle.kts and tell Claude)' }
  $t = [IO.File]::ReadAllText($app)
  $t = [regex]::Replace($t, '(?m)^[ \t]*//noinspection ExpiredTargetSdkVersion[ \t]*\r?\n', '')
  $n = [regex]::Matches($t, $SdkRe).Count
  if ($n -ne 1) { Fail ('expected 1 targetSdk line in app\build.gradle, found ' + $n) }
  $t = [regex]::Replace($t, $SdkRe, '${1}//noinspection ExpiredTargetSdkVersion' + "`r`n" + '${1}${2}${3}32')
  [IO.File]::WriteAllText($app, $t)
  Say 'app\build.gradle: targetSdk set to 32 (with //noinspection ExpiredTargetSdkVersion)'
  # -File: Gradle's own cache FOLDER is called .gradle and also matches '*.gradle' (build 39 fix)
  Get-ChildItem -Path $Proj -Recurse -File -Filter '*.gradle' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -notmatch '\\(build|\.gradle)\\' } | ForEach-Object {
      $c = [IO.File]::ReadAllText($_.FullName)
      if ($c -match 'jcenter\(\)') {
        [IO.File]::WriteAllText($_.FullName, ($c -replace 'jcenter\(\)', 'mavenCentral()'))
        Say ('jcenter() replaced with mavenCentral() in ' + $_.FullName.Substring($Proj.Length + 1))
      }
    }
}
# Checks the Android SDK has what the build needs; installs missing parts with sdkmanager.
function Test-Sdk {
  $sdk = $cfg.androidSdkPath
  if (-not $sdk -or -not (Test-Path $sdk)) { Fail ('Android SDK folder not found: ' + $sdk) }
  $bt = (Get-ChildItem (Join-Path $sdk 'build-tools') -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '
  $pl = (Get-ChildItem (Join-Path $sdk 'platforms') -Directory -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '
  Say ('SDK build-tools: [' + $bt + ']   platforms: [' + $pl + ']')
  $app = [IO.File]::ReadAllText((Join-Path $Proj 'app\build.gradle'))
  $csdk = [regex]::Match($app, '(?m)^[ \t]*(compileSdkVersion|compileSdk)\b[ \t=]*(\d+)').Groups[2].Value
  $need = @()
  if (-not (Find-Tool $cfg 'build-tools' 'zipalign.exe') -or -not (Find-Tool $cfg 'build-tools' 'apksigner.bat') -or -not (Find-Tool $cfg 'build-tools' 'aapt.exe')) { $need += 'build-tools;34.0.0' }
  if ($csdk -and -not (Test-Path (Join-Path $sdk ('platforms\android-' + $csdk)))) { $need += ('platforms;android-' + $csdk) }
  if ($need.Count -eq 0) { Say ('SDK OK (compileSdk ' + $csdk + ')'); return }
  Say ('Installing missing SDK parts: ' + ($need -join ' ') + '  (answer y to the licence if asked - your call)') 'Yellow'
  $sdkm = Find-Tool $cfg 'cmdline-tools' 'sdkmanager.bat'
  if (-not $sdkm) { $sdkm = Find-Tool $cfg 'tools' 'sdkmanager.bat' }
  if (-not $sdkm) { Fail 'sdkmanager.bat not found in the Android SDK. Tell Claude.' }
  & $sdkm ('--sdk_root=' + $sdk) @need
  if ($LASTEXITCODE -ne 0) { Fail 'sdkmanager failed - read the message above (network: run 1-build.bat again)' }
}

# Does what "bubblewrap build" does (Gradle, zipalign, apksigner) without it:
# on Node 18.20.2+/20.12.2+ Windows, bubblewrap's spawn of gradlew.bat fails with "spawn EINVAL".
function Run-Build {
  if (Test-Path $Apk) { Remove-Item $Apk -Force }
  if (-not (Test-TargetSdk32)) { Patch-Gradle }
  Test-Sdk
  $env:ANDROID_HOME = $cfg.androidSdkPath
  $env:ANDROID_SDK_ROOT = $cfg.androidSdkPath
  Say 'Gradle build (first time downloads Gradle and libraries - several minutes)'
  & (Join-Path $Proj 'gradlew.bat') assembleRelease --stacktrace
  if ($LASTEXITCODE -ne 0) { Fail 'Gradle build failed - read the red text above (ECONNRESET / timeout = network: just run 1-build.bat again)' }
  $relDir = Join-Path $Proj 'app\build\outputs\apk\release'
  $built = Get-ChildItem -Path $relDir -File -Filter '*.apk' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if (-not $built) { Fail ('no APK found in ' + $relDir) }
  Say ('Gradle output: ' + $built.Name)
  $zipalign  = Find-Tool $cfg 'build-tools' 'zipalign.exe'
  $apksigner = Find-Tool $cfg 'build-tools' 'apksigner.bat'
  if (-not $zipalign -or -not $apksigner) { Fail 'zipalign.exe or apksigner.bat not found in the Android SDK build-tools' }
  $aligned = Join-Path $Proj 'app-release-unsigned-aligned.apk'
  & $zipalign -v -f -p 4 $built.FullName $aligned | Out-Null
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $aligned)) { Fail 'zipalign failed' }
  $ks = $tm.signingKey.path; $alias = $tm.signingKey.alias
  if (-not $ks) { $ks = '.\android.keystore' }; if (-not $alias) { $alias = 'android' }
  if (-not [IO.Path]::IsPathRooted($ks)) { $ks = Join-Path $Proj $ks }
  if (-not (Test-Path $ks)) { Fail ('keystore not found: ' + $ks) }
  Say ('Signing with ' + $ks + ' (alias ' + $alias + ') - type the KEYSTORE password, then the KEY password if asked') 'Yellow'
  & $apksigner sign --ks $ks --ks-key-alias $alias --out $Apk $aligned
  if ($LASTEXITCODE -ne 0 -or -not (Test-Path $Apk)) { Fail 'apksigner sign failed (wrong password?) - run 1-build.bat again' }
  Remove-Item $aligned -Force -ErrorAction SilentlyContinue
  Say 'Signed APK: project\app-release-signed.apk'
}

if (Test-Path $Log) { Add-Content -Path $Log -Value '' }

# ---------------------------------------------------------------- BUILD
if ($Step -eq 'build') {
  Say 'Step 1/6: Meta''s Bubblewrap CLI (npm)'
  $prefix = (& npm.cmd prefix -g 2>&1 | Out-String).Trim()
  Say ('npm global folder: ' + $prefix)
  $env:Path = $prefix + ';' + $env:Path
  $bw = Join-Path $prefix 'bubblewrap.cmd'
  if (Test-Path $bw) { Say 'already installed - skipping npm install' }
  else {
    & npm.cmd i -g '@meta-quest/bubblewrap-cli'
    if ($LASTEXITCODE -ne 0) { Fail 'npm install of @meta-quest/bubblewrap-cli failed' }
  }
  if (-not (Test-Path $bw)) {
    $found = Get-Command bubblewrap.cmd -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source
    if ($found) { $bw = $found }
  }
  if (-not (Test-Path $bw)) {
    $cmds = (Get-ChildItem -Path $prefix -Filter '*.cmd' -ErrorAction SilentlyContinue | ForEach-Object { $_.Name }) -join ', '
    $ls = (& npm.cmd ls -g --depth=0 2>&1 | Out-String).Trim()
    Say ('commands in npm folder: ' + $cmds)
    Say ('npm ls -g: ' + $ls)
    Fail 'bubblewrap.cmd not found in the npm global folder (details above and in status.log)'
  }
  Say ('bubblewrap: ' + $bw + ' - first run sets up the JDK 17 and Android SDK (answer Yes; the licence is your call)') 'Yellow'
  & $bw --version
  $bwExit = $LASTEXITCODE
  Say ('bubblewrap --version exit code: ' + $bwExit)
  if ($bwExit -ne 0) { Fail 'Bubblewrap setup did not finish (often a dropped download: ECONNRESET). Run 1-build.bat again - npm is not reinstalled. If it fails twice, tell Claude.' }

  New-Item -ItemType Directory -Force -Path $Proj | Out-Null
  Set-Location $Proj
  if (-not (Test-Path 'twa-manifest.json')) {
    Say 'Step 2/6: bubblewrap init - answer with CHEATSHEET.txt (immersive, package ID, skip App ID, your passwords)' 'Yellow'
    & $bw init "--manifest=$Manifest" --metaquest
    if (-not (Test-Path 'twa-manifest.json')) { Fail 'init did not create twa-manifest.json' }
  } else { Say 'Step 2/6: project already exists - skipping init' }

  $tm = Get-Content 'twa-manifest.json' -Raw | ConvertFrom-Json
  Say ('packageId = {0}   horizonOSAppMode = {1}' -f $tm.packageId, $tm.horizonOSAppMode)
  if ($tm.packageId -ne $PkgId) { Fail ('package ID is ' + $tm.packageId + ', expected ' + $PkgId + '. Tell Claude before doing anything else.') }
  if ("$($tm.horizonOSAppMode)" -ne 'immersive') { Fail ('app mode is ' + $tm.horizonOSAppMode + '; build 39 needs immersive in project\twa-manifest.json. Tell Claude.') }

  $cfg = Get-BwConfig; Use-Jdk $cfg
  Say ('JDK: {0}   Android SDK: {1}' -f $cfg.jdkPath, $cfg.androidSdkPath)

  # Keep Meta's original init settings (Platform SDK + horizonpermissions libraries).
  # Turning the Platform SDK off also drops horizonpermissions, so it stays on (decided 25 Oct).
  # If the generated project lacks it (an earlier script removed it), restore and regenerate.
  # Build 39: the Android project must also be regenerated when its app mode differs from
  # twa-manifest.json (2D -> immersive). "bubblewrap update" does that; key and package stay.
  $ModeRe = 'resValue\s+"string",\s*"horizonOSAppMode",\s*''([^'']*)'''
  $gr = [IO.File]::ReadAllText((Join-Path $Proj 'app\build.gradle'))
  $gm = [regex]::Match($gr, $ModeRe).Groups[1].Value
  Say ('Android project app mode = ' + $gm + '   twa-manifest = ' + $tm.horizonOSAppMode)
  if (($gr -notmatch 'horizonplatformsdk') -or ($gm -ne "$($tm.horizonOSAppMode)")) {
    $raw = Get-Content 'twa-manifest.json' -Raw | ConvertFrom-Json
    if (-not $raw.features) { $raw | Add-Member -NotePropertyName features -NotePropertyValue ([pscustomobject]@{}) }
    if (-not $raw.features.PSObject.Properties['horizonPlatformSDK']) {
      $raw.features | Add-Member -NotePropertyName horizonPlatformSDK -NotePropertyValue ([pscustomobject]@{ enabled = $true })
      [IO.File]::WriteAllText((Join-Path $Proj 'twa-manifest.json'), ($raw | ConvertTo-Json -Depth 20))
    }
    Say 'Regenerating the Android project from twa-manifest.json (bubblewrap update, needs internet)' 'Yellow'
    & $bw update --skipVersionUpgrade
    if ($LASTEXITCODE -ne 0) { Fail 'bubblewrap update failed - read the message above and tell Claude' }
    $tm = Get-Content 'twa-manifest.json' -Raw | ConvertFrom-Json
    $gr = [IO.File]::ReadAllText((Join-Path $Proj 'app\build.gradle'))
    if ($gr -notmatch 'horizonplatformsdk') { Fail 'Meta libraries still missing after update. Tell Claude.' }
    $gm = [regex]::Match($gr, $ModeRe).Groups[1].Value
    if ($gm -ne 'immersive') { Fail ('Android project app mode is still ' + $gm + ' after update. Tell Claude.') }
  }
  $am = [IO.File]::ReadAllText((Join-Path $Proj 'app\src\main\AndroidManifest.xml'))
  $cats = ([regex]::Matches($am, 'com\.oculus\.intent\.category\.\w+') | ForEach-Object { $_.Value } | Select-Object -Unique) -join ', '
  Say ('App mode: immersive   launcher categories: ' + $cats + '   version ' + $tm.appVersionName + ' (' + $tm.appVersionCode + ')')
  Say 'Meta libraries: present (original settings)'

  Say 'Step 3/6: edit the Gradle files'
  Patch-Gradle

  Say 'Step 4/6: build the APK'
  Run-Build

  Say 'Step 5/6: check the APK'
  $aapt = Find-Tool $cfg 'build-tools' 'aapt.exe'
  if ($aapt) {
    $badge = & $aapt dump badging $Apk 2>&1 | Out-String
    $pk = [regex]::Match($badge, "package: name='([^']+)'").Groups[1].Value
    $ts = [regex]::Match($badge, "targetSdkVersion:'(\d+)'").Groups[1].Value
    Say ('APK package = {0}   targetSdk = {1}' -f $pk, $ts)
    if ($ts -and $ts -ne '32') { Fail ('APK targetSdk is ' + $ts + ', expected 32') }
  } else { Say 'aapt.exe not found - skipped APK check' 'Yellow' }

  Say 'Step 6/6: signing fingerprint and assetlinks.json (no password needed)'
  $apksigner = Find-Tool $cfg 'build-tools' 'apksigner.bat'
  if (-not $apksigner) { Fail 'apksigner.bat not found in the Android SDK build-tools' }
  $sig = & $apksigner verify --print-certs $Apk 2>&1 | Out-String
  $hex = [regex]::Match($sig, 'SHA-256 digest:\s*([0-9a-fA-F]{64})').Groups[1].Value
  if (-not $hex) { Write-Host $sig; Fail 'could not read the SHA-256 fingerprint from the APK' }
  $fp = (($hex.ToUpper() -split '(..)') | Where-Object { $_ }) -join ':'
  Say ('SHA-256 = ' + $fp)
  $al = Join-Path $Proj 'assetlinks.json'
  if ((Test-Path $al) -and ([IO.File]::ReadAllText($al) -match [regex]::Escape($fp))) { Say 'assetlinks.json already has this fingerprint' }
  else { & $bw fingerprint add $fp }
  if (-not (Test-Path 'assetlinks.json')) { & $bw fingerprint generateAssetLinks }
  if (-not (Test-Path 'assetlinks.json')) { Fail 'assetlinks.json was not generated' }
  Copy-Item 'assetlinks.json' (Join-Path $Root 'assetlinks.json') -Force
  Say 'BUILD DONE. Tell Claude "built" - Claude checks/publishes assetlinks.json, then you run 2-install.bat.' 'Green'
  Say 'BACK UP project\android.keystore and your two passwords. Without them the app can never be updated.' 'Yellow'
  Read-Host 'Press Enter to close'
  exit 0
}

# ---------------------------------------------------------------- INSTALL
if ($Step -eq 'install') {
  if (-not (Test-Path $Apk)) { Fail 'project\app-release-signed.apk not found - run 1-build.bat first' }
  $cfg = Get-BwConfig; Use-Jdk $cfg
  $adb = (Get-Command adb.exe -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty Source)
  if (-not $adb) { $adb = Find-Tool $cfg 'platform-tools' 'adb.exe' }
  if (-not $adb) {
    Say 'adb not found - installing Android platform-tools (answer y to the licence if asked)' 'Yellow'
    $sdkm = Find-Tool $cfg 'cmdline-tools' 'sdkmanager.bat'
    if (-not $sdkm) { $sdkm = Find-Tool $cfg 'tools' 'sdkmanager.bat' }
    if (-not $sdkm) { Fail 'sdkmanager.bat not found. Install Google''s "SDK Platform-Tools for Windows" and run again.' }
    & $sdkm ("--sdk_root=" + $cfg.androidSdkPath) 'platform-tools'
    $adb = Find-Tool $cfg 'platform-tools' 'adb.exe'
    if (-not $adb) { Fail 'adb still not found after installing platform-tools' }
  }
  Say ('adb: ' + $adb)
  Say 'Before you continue: Developer Mode ON (Meta Horizon phone app), headset plugged in with a USB-C DATA cable, put it on and tap "Allow" for USB debugging.' 'Yellow'
  Read-Host 'Press Enter when that is done'
  & $adb start-server | Out-Null
  for ($i = 0; $i -lt 3; $i++) {
    $dev = & $adb devices 2>&1 | Out-String
    Write-Host $dev
    if ($dev -match '(?m)^\S+\s+device\s*$') { break }
    if ($dev -match 'unauthorized') { Say 'Headset says unauthorized: put it on and tap Allow USB debugging.' 'Yellow' }
    else { Say 'No headset found: check the cable is a data cable and Developer Mode is on.' 'Yellow' }
    Read-Host 'Press Enter to try again'
  }
  if ($dev -notmatch '(?m)^\S+\s+device\s*$') { Fail 'no authorised headset found' }
  Say 'Installing the app'
  & $adb install -r $Apk
  if ($LASTEXITCODE -ne 0) { Fail 'adb install failed - read the message above' }
  Say 'INSTALLED. On the headset: Library -> Unknown Sources -> Inside the Cloud.' 'Green'
  Read-Host 'Press Enter to close'
  exit 0
}
