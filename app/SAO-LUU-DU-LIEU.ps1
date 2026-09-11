$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $Root
$Stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$BackupDir = Join-Path $Root "backups\$Stamp"
New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
$DbContainer = docker compose ps -q db
docker compose exec -T db sh -c "pg_dump -U mnd_admin -d mnd_os -Fc > /tmp/mnd-os.dump"
docker cp "${DbContainer}:/tmp/mnd-os.dump" (Join-Path $BackupDir "mnd-os.dump")
docker compose exec -T db rm -f /tmp/mnd-os.dump
docker run --rm -v mnd_os_uploads:/source:ro -v "${BackupDir}:/backup" alpine tar -czf /backup/ho-so.tar.gz -C /source .
Copy-Item ".env" (Join-Path $BackupDir "env-backup.txt")
Write-Host "Sao luu thanh cong: $BackupDir" -ForegroundColor Green
