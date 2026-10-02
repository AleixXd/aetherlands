# tests/run.ps1 — suite de regresion de Aetherlands (sin dependencias: solo Chrome + PowerShell)
# Uso:  powershell -ExecutionPolicy Bypass -File tests\run.ps1
# Exit 0 = todo OK · Exit 1 = hay fallos · Exit 2 = entorno roto
param([int]$Port = 8941, [int]$WaitSec = 100)
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$chrome = "C:\Program Files\Google\Chrome\Application\chrome.exe"
$tmp = Join-Path $env:TEMP "opencode"
New-Item -ItemType Directory -Path $tmp -Force | Out-Null
$fail = $false

function Check([string]$name, [bool]$ok, [string]$detail = "") {
  if ($ok) { Write-Host "  PASS  $name" -ForegroundColor Green }
  else { Write-Host "  FAIL  $name  $detail" -ForegroundColor Red; $script:fail = $true }
}

Write-Host "=== Aetherlands · tests ===" -ForegroundColor Cyan

# ---------- 1) estructura ----------
Write-Host "[1/4] estructura" -ForegroundColor Yellow
Check "index.html" (Test-Path "$root\index.html")
Check "css/style.css" (Test-Path "$root\css\style.css")
foreach ($f in @("manifest.json", "sw.js", "icon-192.png", "icon-512.png")) {
  Check $f (Test-Path "$root\$f")
}
$idx = Get-Content "$root\index.html" -Raw
$srcs = [regex]::Matches($idx, 'src="(js/[^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$hrefs = [regex]::Matches($idx, 'href="(css/[^"]+)"') | ForEach-Object { $_.Groups[1].Value }
$missing = @($srcs + $hrefs | Where-Object { -not (Test-Path "$root\$_") })
Check "recursos del index existen ($($srcs.Count) js + $($hrefs.Count) css)" ($missing.Count -eq 0) ($missing -join ", ")
try {
  $man = Get-Content "$root\manifest.json" -Raw | ConvertFrom-Json
  Check "manifest.json valido" ($man.name -and $man.icons.Count -ge 1)
  $badIcons = @($man.icons | Where-Object { -not (Test-Path (Join-Path $root $_.src)) })
  Check "iconos del manifest existen" ($badIcons.Count -eq 0)
} catch { Check "manifest.json valido" $false $_.Exception.Message }
$sw = Get-Content "$root\sw.js" -Raw
$swFiles = [regex]::Matches($sw, '"\./[^"]*"') | ForEach-Object { $_.Value.Trim('"').Substring(2) }
$notCached = @($srcs + $hrefs | Where-Object { $swFiles -notcontains $_ })
Check "sw.js cachea los recursos del index" ($notCached.Count -eq 0) ($notCached -join ", ")

# ---------- 2) pagina de prueba ----------
Write-Host "[2/4] inyeccion del probe" -ForegroundColor Yellow
$testHtml = Join-Path $root "__autotest.html"
$injected = $idx -replace '</body>', "<script src=`"tests/probe.js`"></script>`n</body>"
[System.IO.File]::WriteAllText($testHtml, $injected, [System.Text.UTF8Encoding]::new($false))
Check "copia __autotest.html creada" (Test-Path $testHtml)

# ---------- 3) servidor + chrome ----------
Write-Host "[3/4] ejecucion en Chrome headless" -ForegroundColor Yellow
$errFile = Join-Path $tmp "autotest_err.txt"
$outFile = Join-Path $tmp "autotest_out.txt"
$png = Join-Path $tmp "autotest.png"
$prof = Join-Path $tmp "autotest_prof"
$srvOut = Join-Path $tmp "autotest_srv.txt"
foreach ($f in @($errFile, $outFile, $png, $srvOut)) { if (Test-Path $f) { Remove-Item $f -Force } }
if (Test-Path $prof) { Remove-Item -Recurse -Force $prof }
# solo mata instancias headless de ESTA suite (no el Chrome del usuario)
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'autotest_prof' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
# libera el puerto si quedo un servidor zombi de una ejecucion anterior
Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
$srv = Start-Process -FilePath "powershell.exe" -ArgumentList "-NoProfile","-ExecutionPolicy","Bypass","-File","`"$PSScriptRoot\server.ps1`"","-Port","$Port" -RedirectStandardOutput $srvOut -RedirectStandardError (Join-Path $tmp "autotest_srv_err.txt") -WindowStyle Hidden -PassThru
$up = $false
for ($i = 0; $i -lt 20 -and -not $up; $i++) {
  Start-Sleep -Milliseconds 500
  try { $r = Invoke-WebRequest "http://localhost:$Port/" -UseBasicParsing -TimeoutSec 3; $up = ($r.StatusCode -eq 200) } catch {}
}
Check "servidor local en :$Port" $up
$chromeOk = $false
if ($up) {
  $arg = "--headless=new --no-sandbox --disable-extensions --disable-background-networking --use-angle=swiftshader --enable-unsafe-swiftshader --enable-logging=stderr --v=0 --user-data-dir=`"$prof`" --virtual-time-budget=6000 --hide-scrollbars --window-size=1280,720 --screenshot=`"$png`" `"http://localhost:$Port/__autotest.html`""
  $p = Start-Process -FilePath $chrome -ArgumentList $arg -RedirectStandardError $errFile -RedirectStandardOutput $outFile -PassThru -WindowStyle Hidden
  # espera el FIN del probe por stderr (el cierre de Chrome depende del render y puede ser lento)
  $w = 0; $finSeen = $false
  while (!$p.HasExited -and $w -lt $WaitSec) {
    Start-Sleep -Seconds 1; $w++
    try { if ((Get-Content $errFile -Raw -ErrorAction Stop) -match '\[TEST\]\s+FIN') { $finSeen = $true; break } } catch {}
  }
  if (!$finSeen -and (Test-Path $errFile)) {
    try { if ((Get-Content $errFile -Raw -ErrorAction Stop) -match '\[TEST\]\s+FIN') { $finSeen = $true } } catch {}
  }
  if ($finSeen) { Start-Sleep -Seconds 4 }
  if (!$p.HasExited) { Stop-Process -Id $p.Id -Force }
  $chromeOk = $finSeen
  Check "chrome: FIN del probe (espera ${w}s)" $finSeen
  if (Test-Path $png) { Write-Host "  OK    screenshot generado" -ForegroundColor Green }
  else { Write-Host "  AVISO screenshot omitido (render lento, no afecta a las aserciones)" -ForegroundColor Yellow }
}

# ---------- 4) resultados ----------
Write-Host "[4/4] aserciones" -ForegroundColor Yellow
$console = @()
if (Test-Path $errFile) {
  $console = Get-Content $errFile | Where-Object { $_ -match 'CONSOLE' }
}
$tests = @($console | Where-Object { $_ -match '\[TEST\]\t(PASS|FAIL)\t' } | ForEach-Object {
  $rest = $_.Substring($_.IndexOf("[TEST]") + 7)
  $cut = $rest.IndexOf('", source:')
  if ($cut -ge 0) { $rest = $rest.Substring(0, $cut) }
  else { $rest = $rest.TrimEnd('"') }
  $p = $rest -split "`t", 4
  [PSCustomObject]@{ R = $p[0]; Name = $p[1]; Det = $p[2] }
})
foreach ($t in $tests) {
  if ($t.R -eq "PASS") { Write-Host "  PASS  $($t.Name)" -ForegroundColor Green }
  else { Write-Host "  FAIL  $($t.Name)  $($t.Det)" -ForegroundColor Red; $fail = $true }
}
$fin = @($console | Where-Object { $_ -match '\[TEST\]\tFIN\t' })
Check "probe llego a FIN" ($fin.Count -gt 0)
$errs = @($console | Where-Object { $_ -notmatch '\[TEST\]|\[SW\]|deprecated' -and $_ -match 'Uncaught|ReferenceError|TypeError|SyntaxError|RangeError' })
Check "consola sin errores JS" ($errs.Count -eq 0) ($errs.Count.ToString() + " errores")
if ($fin.Count -gt 0) { Check "0 aserciones fallidas" (-not ($fin -match 'fails=(?!0)')) }

# ---------- limpieza ----------
if ($srv -and !$srv.HasExited) { Stop-Process -Id $srv.Id -Force }
if (Test-Path $testHtml) { Remove-Item $testHtml -Force }
Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -match 'autotest_prof' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

Write-Host ""
if ($fail) { Write-Host "RESULTADO: HAY FALLOS" -ForegroundColor Red; exit 1 }
Write-Host "RESULTADO: TODO OK" -ForegroundColor Green; exit 0
