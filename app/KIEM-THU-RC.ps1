$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Health = Invoke-RestMethod -Uri "http://localhost:3200/health" -TimeoutSec 10
if ($Health.status -ne "healthy" -or $Health.version -ne "1.3.1-rc") { throw "Sai phien ban hoac ung dung chua san sang." }
$Tables = docker compose exec -T db psql -U mnd_admin -d mnd_os -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
if ([int]$Tables -lt 11) { throw "Migration 1.3.0 RC chua day du: chi co $Tables bang." }
$Volumes = docker volume ls --format "{{.Name}}"
if ($Volumes -notcontains "mnd_os_data" -or $Volumes -notcontains "mnd_os_uploads") { throw "Thieu volume du lieu hoac ho so." }
Write-Host "KIEM THU KY THUAT DAT: API healthy, version 1.3.1-rc, $Tables bang, du 2 volume." -ForegroundColor Green
Write-Host "Tiep tuc kiem thu nghiep vu theo CHECKLIST-NGHIEM-THU-1.3.0-RC.txt" -ForegroundColor Yellow
