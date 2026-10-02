# tests/server.ps1 — servidor HTTP mínimo para la suite de tests
param([int]$Port = 8941, [string]$Root = "")
$ErrorActionPreference = "SilentlyContinue"
if (-not $Root) { $Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path) }
$mime = @{
  ".html" = "text/html; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".png"  = "image/png"
  ".txt"  = "text/plain; charset=utf-8"
}
$l = New-Object System.Net.HttpListener
$l.Prefixes.Add("http://localhost:$Port/")
$l.Start()
while ($l.IsListening) {
  try {
    $ctx = $l.GetContext()
    $rel = $ctx.Request.Url.LocalPath
    if ($rel -eq "/") { $rel = "/index.html" }
    $rel = $rel -replace "/", [IO.Path]::DirectorySeparatorChar
    $path = Join-Path $Root ($rel.TrimStart([IO.Path]::DirectorySeparatorChar))
    if ($path.StartsWith($Root) -and (Test-Path -LiteralPath $path) -and -not (Get-Item -LiteralPath $path).PSIsContainer) {
      $b = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      $ctx.Response.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { "application/octet-stream" }
      $ctx.Response.ContentLength64 = $b.Length
      $ctx.Response.OutputStream.Write($b, 0, $b.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $m = [Text.Encoding]::UTF8.GetBytes("404")
      $ctx.Response.OutputStream.Write($m, 0, $m.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch {}
}
