$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Latest = Get-ChildItem (Join-Path $Root "backups") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $Latest) { throw "Chua co ban sao luu. Hay chay SAO-LUU-DU-LIEU.ps1 truoc." }
$Dump = Join-Path $Latest.FullName "mnd-os.dump"
if (-not (Test-Path $Dump)) { throw "Khong tim thay mnd-os.dump trong ban sao luu moi nhat." }
$DbContainer = docker compose ps -q db
if (-not $DbContainer) { throw "PostgreSQL chua chay." }
$TestDb = "mnd_restore_test"
docker compose exec -T db psql -U mnd_admin -d postgres -c "DROP DATABASE IF EXISTS $TestDb WITH (FORCE);"
docker compose exec -T db psql -U mnd_admin -d postgres -c "CREATE DATABASE $TestDb;"
docker cp $Dump "${DbContainer}:/tmp/mnd-restore-test.dump"
docker compose exec -T db pg_restore -U mnd_admin -d $TestDb --no-owner /tmp/mnd-restore-test.dump
$Tables = docker compose exec -T db psql -U mnd_admin -d $TestDb -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
if ([int]$Tables -lt 6) { throw "Ban sao luu khong du bang du lieu. Khong dat kiem tra." }
docker compose exec -T db psql -U mnd_admin -d postgres -c "DROP DATABASE $TestDb WITH (FORCE);"
docker compose exec -T db rm -f /tmp/mnd-restore-test.dump
Write-Host "KIEM TRA PHUC HOI DAT: $Tables bang du lieu. Du lieu dang van hanh khong bi thay doi." -ForegroundColor Green
