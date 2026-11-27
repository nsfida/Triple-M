# Fines Automation - Outlook helper
# Keeps listening on this PC (127.0.0.1 only). When the web page's "Send email" button is clicked,
# the finished email draft is received here and opened directly in Outlook (default .eml program).
$port = 8765
$dir  = Join-Path $env:TEMP 'FinesAutomationDrafts'
New-Item -ItemType Directory -Force -Path $dir | Out-Null
Get-ChildItem $dir -Filter *.eml -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-1) } | Remove-Item -Force -ErrorAction SilentlyContinue

$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://127.0.0.1:$port/")
try { $l.Start() } catch { Write-Host "Cannot start on port $port (is the helper already running?)" -ForegroundColor Red; Start-Sleep 3; exit }
Write-Host "Outlook helper is running. Keep this window open (minimise it) while you send emails." -ForegroundColor Green

while ($l.IsListening) {
  $ctx = $l.GetContext(); $req = $ctx.Request; $res = $ctx.Response
  $res.Headers.Add('Access-Control-Allow-Origin', '*')
  $res.Headers.Add('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
  $res.Headers.Add('Access-Control-Allow-Headers', '*')
  $res.Headers.Add('Access-Control-Allow-Private-Network', 'true')
  try {
    if ($req.HttpMethod -eq 'POST' -and $req.Url.AbsolutePath -eq '/open') {
      $name = [System.Uri]::UnescapeDataString(($req.QueryString['name'] + ''))
      $name = ($name -replace '[\\/:*?"<>|]', '_').Trim()
      if (-not $name.ToLower().EndsWith('.eml')) { $name += '.eml' }
      $path = Join-Path $dir ((Get-Date -Format 'HHmmss') + ' ' + $name)
      $fs = [System.IO.File]::Create($path)
      $req.InputStream.CopyTo($fs); $fs.Close()
      Start-Process -FilePath $path
      Write-Host ("Opened: " + $name)
      $res.StatusCode = 200
    } else { $res.StatusCode = 200 }   # OPTIONS preflight / ping
  } catch {
    Write-Host ("Error: " + $_.Exception.Message) -ForegroundColor Red
    $res.StatusCode = 500
  }
  $res.Close()
}
