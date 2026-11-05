<#
  Builds the Microsoft Store packages on Windows with the Windows SDK (MakeAppx.exe):
  TriplemVIP-x64.msix, TriplemVIP-arm64.msix and TriplemVIP.msixbundle.
  (On Linux/CI, build_msix.sh does the same with Microsoft's open-source makemsix.)

    1. Build both app executables with scripts/windows_app/build_windows_app.sh
       (they are left in %TEMP%/triplem-vip-windows-build as TriplemVIP.exe and
       TriplemVIP-arm64.exe) or copy them next to this file.
    2. Run:
       powershell -ExecutionPolicy RemoteSigned -File build_msix.ps1 `
         -AppExe C:\path\TriplemVIP.exe -AppExeArm64 C:\path\TriplemVIP-arm64.exe
    3. Upload TriplemVIP.msixbundle (or both .msix files) in Partner Center.
       Microsoft signs Store packages after certification; do not self-sign them.
#>
param(
  [Parameter(Mandatory = $true)][string]$AppExe,
  [string]$AppExeArm64 = "",
  [string]$OutDir = $PSScriptRoot
)
$ErrorActionPreference = "Stop"

$manifest = Join-Path $PSScriptRoot "AppxManifest.xml"
$manifestText = Get-Content $manifest -Raw
if ($manifestText -match "REPLACE") {
  throw "Fill in the Partner Center Product identity values in AppxManifest.xml first (search for REPLACE)."
}
$version = ([regex]::Match($manifestText, 'Version="(\d+\.\d+\.\d+\.\d+)"')).Groups[1].Value
$makeAppx = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\makeappx.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $makeAppx) { throw "MakeAppx.exe not found. Install the Windows 10/11 SDK." }

$work = Join-Path $env:TEMP "TriplemVIP-msix"
if (Test-Path $work) { Remove-Item $work -Recurse -Force }
$bundleDir = Join-Path $work "bundle"
New-Item -ItemType Directory -Path $bundleDir -Force | Out-Null

function Pack([string]$arch, [string]$exe) {
  $stage = Join-Path $work "stage-$arch"
  New-Item -ItemType Directory -Path $stage | Out-Null
  Copy-Item $exe (Join-Path $stage "TriplemVIP.exe")
  ($manifestText -replace "@ARCH@", $arch) | Set-Content -Path (Join-Path $stage "AppxManifest.xml") -Encoding UTF8
  Copy-Item (Join-Path $PSScriptRoot "Assets") (Join-Path $stage "Assets") -Recurse
  $out = Join-Path $bundleDir "TriplemVIP-$arch.msix"
  & $makeAppx.FullName pack /d $stage /p $out /o
  if ($LASTEXITCODE -ne 0) { throw "MakeAppx failed for $arch ($LASTEXITCODE)." }
  Copy-Item $out $OutDir
}

Pack "x64" $AppExe
if ($AppExeArm64) { Pack "arm64" $AppExeArm64 }
& $makeAppx.FullName bundle /d $bundleDir /p (Join-Path $OutDir "TriplemVIP.msixbundle") /bv $version /o
if ($LASTEXITCODE -ne 0) { throw "MakeAppx bundle failed ($LASTEXITCODE)." }
Write-Host "Created TriplemVIP.msixbundle $version in $OutDir - upload it in Partner Center (Microsoft signs Store packages)."
