<#
  Release check on Windows: verifies the Authenticode signature, certificate
  chain (to a Windows-trusted root) and timestamp of the Triplem VIP files.
  Requires the Windows SDK (signtool.exe).

    powershell -ExecutionPolicy RemoteSigned -File verify-on-windows.ps1 -Files TriplemVIP_Setup.exe
#>
param([Parameter(Mandatory = $true)][string[]]$Files)
$ErrorActionPreference = "Stop"
$signtool = Get-ChildItem "${env:ProgramFiles(x86)}\Windows Kits\10\bin\*\x64\signtool.exe" -ErrorAction SilentlyContinue |
  Sort-Object FullName -Descending | Select-Object -First 1
if (-not $signtool) { throw "signtool.exe not found. Install the Windows 10/11 SDK." }
$failed = $false
foreach ($f in $Files) {
  Write-Host "== $f"
  & $signtool.FullName verify /pa /all /tw /v $f
  if ($LASTEXITCODE -ne 0) { $failed = $true; Write-Host "FAILED: $f" -ForegroundColor Red }
  $sig = Get-AuthenticodeSignature $f
  Write-Host ("Status: {0}  Signer: {1}  Timestamp: {2}" -f $sig.Status, $sig.SignerCertificate.Subject, $sig.TimeStamperCertificate.Subject)
}
if ($failed) { exit 1 }
Write-Host "All files are signed, chained to a trusted root and timestamped." -ForegroundColor Green
