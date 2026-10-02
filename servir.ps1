# servir.ps1 — servidor HTTP local para jugar en la red (LAN)
# Uso:  powershell -ExecutionPolicy Bypass -File servir.ps1
# Luego abre  http://<IP-del-PC>:8080  desde cualquier dispositivo de la misma red.

$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
if (-not $root) { $root = (Get-Location).Path }

$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".jpg"  = "image/jpeg"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
  ".txt"  = "text/plain; charset=utf-8"
}

try {
  $ips = [System.Net.Dns]::GetHostAddresses([System.Net.Dns]::GetHostName()) |
    Where-Object { $_.AddressFamily -eq 'InterNetwork' }
} catch { $ips = @() }

Write-Host ""
Write-Host "=== Aetherlands - servidor local ===" -ForegroundColor Cyan
Write-Host "Carpeta: $root"
foreach ($ip in $ips) { Write-Host "  http://$($ip.IPAddressToString):$port" -ForegroundColor Green }
Write-Host "  http://localhost:$port" -ForegroundColor Green
Write-Host "Pulsa Ctrl+C para detener." -ForegroundColor Yellow
Write-Host ""

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://+:$port/")
try {
  $listener.Start()
} catch {
  Write-Host "No se pudo abrir el puerto $port. Ejecuta:" -ForegroundColor Red
  Write-Host "  netsh http add urlacl url=http://+:$port/ user=Everyone" -ForegroundColor Red
  exit 1
}

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = $ctx.Request.Url.LocalPath
    if ($rel -eq "/" -or $rel -eq "") { $rel = "/index.html" }
    $rel = $rel -replace "/", [IO.Path]::DirectorySeparatorChar
    $rel = $rel.TrimStart([IO.Path]::DirectorySeparatorChar)
    $path = Join-Path $root $rel

    if ($path.StartsWith($root) -and (Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).PSIsContainer -eq $false) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($mime.ContainsKey($ext)) { $ctx.Response.ContentType = $mime[$ext] }
      else { $ctx.Response.ContentType = "application/octet-stream" }
      $ctx.Response.ContentLength64 = $bytes.Length
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
      $ctx.Response.OutputStream.Close()
    } else {
      $msg = [Text.Encoding]::UTF8.GetBytes("404 - No encontrado")
      $ctx.Response.StatusCode = 404
      $ctx.Response.ContentType = "text/plain; charset=utf-8"
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
      $ctx.Response.OutputStream.Close()
    }
  } catch {
    Write-Host "Error: $($_.Exception.Message)" -ForegroundColor Red
  }
}

$listener.Stop()
