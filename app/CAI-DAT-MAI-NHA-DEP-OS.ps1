$ErrorActionPreference = "Stop"
$InstallRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$LogFile = Join-Path $InstallRoot "NHAT-KY-CAI-DAT.txt"
Set-Location $InstallRoot

try {
  Start-Transcript -Path $LogFile -Append | Out-Null
  Write-Host "================================================" -ForegroundColor Cyan
  Write-Host "       MAI NHA DEP OS 1.3.1 RC" -ForegroundColor Cyan
  Write-Host "================================================" -ForegroundColor Cyan
  Write-Host "Khong ket noi MISA. Khong thay doi Eurogold OS." -ForegroundColor Green
  Write-Host "Thu muc cai dat: $InstallRoot"

  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    throw "Khong tim thay lenh Docker. Hay cai va mo Docker Desktop, sau do chay lai CAI-DAT.bat."
  }

  Write-Host "[1/6] Kiem tra Docker Desktop..." -ForegroundColor Yellow
  & docker info
  if ($LASTEXITCODE -ne 0) { throw "Docker Desktop chua khoi dong hoac Docker Engine chua san sang." }

  & docker compose version
  if ($LASTEXITCODE -ne 0) { throw "May chua co Docker Compose V2." }

  # Cac phien ban duoc giai nen vao thu muc rieng nhung dung chung volume.
  # Khi nang cap phai ke thua DB_PASSWORD cu; tao mat khau moi se gay auth_failed.
  $DataVolumeExists = $false
  & docker volume inspect mnd_os_data *> $null
  if ($LASTEXITCODE -eq 0) { $DataVolumeExists = $true }

  $PreviousEnvs = Get-ChildItem -Path (Split-Path $InstallRoot -Parent) -Directory -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne $InstallRoot -and $_.Name -like "Mai-Nha-Dep-OS-Docker-*" } |
    Sort-Object LastWriteTime -Descending |
    ForEach-Object { Join-Path $_.FullName ".env" } |
    Where-Object { Test-Path $_ }

  if ($DataVolumeExists -and $PreviousEnvs) {
    if (Test-Path ".env") {
      $EnvBackup = ".env.truoc-khi-sua-" + (Get-Date -Format "yyyyMMdd-HHmmss")
      Copy-Item ".env" $EnvBackup -Force
    }
    $ValidEnv = $null
    foreach ($CandidateEnv in $PreviousEnvs) {
      Copy-Item $CandidateEnv ".env" -Force
      & docker compose up -d db | Out-Host
      if ($LASTEXITCODE -ne 0) { continue }
      $DbLine = Get-Content $CandidateEnv | Where-Object { $_ -like "DB_PASSWORD=*" } | Select-Object -First 1
      if (-not $DbLine) { continue }
      $CandidateDbPassword = $DbLine.Substring("DB_PASSWORD=".Length)
      & docker compose exec -T -e "PGPASSWORD=$CandidateDbPassword" db psql -U mnd_admin -d mnd_os -tAc "SELECT 1" *> $null
      if ($LASTEXITCODE -eq 0) { $ValidEnv = $CandidateEnv; break }
    }
    if (-not $ValidEnv) { throw "Khong tim thay cau hinh cu khop voi du lieu PostgreSQL. Bo cai dung lai, khong thay doi du lieu." }
    Copy-Item $ValidEnv ".env" -Force
    Write-Host "[2/6] Nang cap: giu nguyen tai khoan CEO va du lieu cu." -ForegroundColor Yellow
  } elseif ($DataVolumeExists -and -not (Test-Path ".env")) {
    throw "Da co du lieu mnd_os_data nhung khong tim thay file .env ban cu. Bo cai dung lai de bao ve du lieu va khong tao lai tai khoan CEO."
  } elseif (Test-Path ".env") {
    Write-Host "[2/6] Da co cau hinh. Giu nguyen tai khoan va du lieu cu." -ForegroundColor Yellow
  } else {
    Write-Host "[2/6] Tao tai khoan CEO..." -ForegroundColor Yellow
    $CeoName = Read-Host "Nhap ho ten CEO"
    $CeoEmail = Read-Host "Nhap email dang nhap CEO"
    $Secure = Read-Host "Tao mat khau CEO (toi thieu 10 ky tu)" -AsSecureString
    $Ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secure)
    try { $CeoPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($Ptr) }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($Ptr) }
    if ([string]::IsNullOrWhiteSpace($CeoName)) { throw "Ten CEO khong duoc de trong." }
    if ($CeoEmail -notmatch '^[^@\s]+@[^@\s]+\.[^@\s]+$') { throw "Email CEO khong hop le." }
    if ($CeoPassword.Length -lt 10) { throw "Mat khau phai co it nhat 10 ky tu." }
    if ($CeoPassword -match '[#`$]') { throw "Lan cai dau, mat khau khong dung cac ky tu #, `$ hoac dau nhay. Hay dung chu, so va !@%_-" }
    $Chars = (48..57)+(65..90)+(97..122)
    $DbPassword = -join ($Chars | Get-Random -Count 32 | ForEach-Object {[char]$_})
    $SessionSecret = -join ($Chars | Get-Random -Count 48 | ForEach-Object {[char]$_})
    $Lines = @("CEO_NAME=$CeoName","CEO_EMAIL=$CeoEmail","CEO_PASSWORD=$CeoPassword","DB_PASSWORD=$DbPassword","SESSION_SECRET=$SessionSecret")
    [IO.File]::WriteAllLines((Join-Path $InstallRoot ".env"), $Lines, (New-Object Text.UTF8Encoding($false)))
  }

  Write-Host "[3/6] Sao luu truoc khi nang cap..." -ForegroundColor Yellow
  if ($DataVolumeExists) {
    & powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File (Join-Path $InstallRoot "SAO-LUU-DU-LIEU.ps1")
    if ($LASTEXITCODE -ne 0) { throw "Khong the sao luu. Da dung nang cap de bao ve du lieu." }
  } else {
    Write-Host "Cai moi: chua co du lieu can sao luu."
  }

  Write-Host "[4/6] Kiem tra cau hinh..." -ForegroundColor Yellow
  & docker compose config --quiet
  if ($LASTEXITCODE -ne 0) { throw "File cau hinh Docker khong hop le. Xem $LogFile" }

  Write-Host "[5/6] Tai va dong goi ung dung. Lan dau co the mat 5-15 phut..." -ForegroundColor Yellow
  & docker compose up -d --build
  if ($LASTEXITCODE -ne 0) { throw "Docker khong the tao ung dung. Xem nhat ky phia tren." }

  Write-Host "[6/6] Cho ung dung san sang..." -ForegroundColor Yellow
  $Ready = $false
  for ($i=1; $i -le 30; $i++) {
    try {
      $Health = Invoke-RestMethod -Uri "http://localhost:3200/health" -TimeoutSec 4
      if ($Health.status -eq "healthy") { $Ready = $true; break }
    } catch { Start-Sleep -Seconds 4 }
    Write-Host "Dang khoi dong... lan kiem tra $i/30"
  }
  if (-not $Ready) {
    Write-Host "----- NHAT KY APP -----" -ForegroundColor Yellow
    & docker compose logs --tail 100 app
    throw "Ung dung chua san sang sau 2 phut. Gui file NHAT-KY-CAI-DAT.txt de kiem tra."
  }

  docker compose ps | Out-Host
  Write-Host "================================================" -ForegroundColor Green
  Write-Host "CAI DAT THANH CONG" -ForegroundColor Green
  Write-Host "Mo app tren may CEO: http://localhost:3200" -ForegroundColor Cyan
  Write-Host "Du lieu: mnd_os_data | Ho so: mnd_os_uploads"
  Write-Host "Khong chay docker compose down -v."
  Write-Host "================================================" -ForegroundColor Green
  Start-Process "http://localhost:3200"
}
catch {
  Write-Host "" 
  Write-Host "CAI DAT CHUA THANH CONG:" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Nhat ky duoc luu tai: $LogFile" -ForegroundColor Yellow
}
finally {
  try { Stop-Transcript | Out-Null } catch {}
  Write-Host ""
  Read-Host "Nhan Enter de dong cua so"
}
