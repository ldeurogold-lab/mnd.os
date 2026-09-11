$ErrorActionPreference = 'Stop'

function Restore-MndSource {
    param([string]$BackupPath)
    Copy-Item -LiteralPath (Join-Path $BackupPath 'server.js') -Destination $script:serverPath -Force
    Copy-Item -LiteralPath (Join-Path $BackupPath 'index.html') -Destination $script:indexPath -Force
    Copy-Item -LiteralPath (Join-Path $BackupPath 'agent-routes.js') -Destination $script:agentRoutesPath -Force
    Copy-Item -LiteralPath (Join-Path $BackupPath 'edit-work.js') -Destination $script:editRoutesPath -Force
    Copy-Item -LiteralPath (Join-Path $BackupPath 'edit-work-ui.js') -Destination $script:editUiPath -Force
    Copy-Item -LiteralPath (Join-Path $BackupPath 'manifest.json') -Destination $script:manifestPath -Force
}

try {
    Write-Host '[1/7] Xac dinh app dang chay...'
    $info = docker inspect mnd-os-app-1 | ConvertFrom-Json
    if ($LASTEXITCODE -ne 0 -or !$info) { throw 'Khong tim thay container mnd-os-app-1.' }
    $target = $info[0].Config.Labels.'com.docker.compose.project.working_dir'
    if (!$target) { throw 'Khong xac dinh duoc thu muc app dang chay.' }

    $script:serverPath = Join-Path $target 'server.js'
    $script:indexPath = Join-Path $target 'public\index.html'
    $script:agentRoutesPath = Join-Path $target 'agent-routes.js'
    $script:editRoutesPath = Join-Path $target 'edit-work.js'
    $script:editUiPath = Join-Path $target 'public\edit-work.js'
    $script:manifestPath = Join-Path $target 'public\manifest.json'
    $backupScript = Join-Path $target 'SAO-LUU-DU-LIEU.ps1'
    $envPath = Join-Path $target '.env'

    foreach ($file in @($serverPath,$indexPath,$agentRoutesPath,$editRoutesPath,$editUiPath,$manifestPath,$backupScript,$envPath)) {
        if (!(Test-Path -LiteralPath $file -PathType Leaf)) {
            throw ('Thieu file bat buoc: ' + $file + '. Chua thay doi app.')
        }
    }

    Write-Host '[2/7] Kiem tra va tao ma nguon nang cap...'
    $server = Get-Content -LiteralPath $serverPath -Raw -Encoding UTF8
    $index = Get-Content -LiteralPath $indexPath -Raw -Encoding UTF8
    if ($server -notmatch 'const\s+initSubcontract' -or $server -notmatch '\.then\(initSubcontract\)') {
        throw 'Can app 1.9 Nhan thau & Giao khoan tro len. Chua thay doi app.'
    }
    if ($index -notmatch '</body>') { throw 'index.html khong hop le. Chua thay doi app.' }

    if ($server -notmatch 'const\s+initExportExcel') {
        $anchor = 'const initLocal ='
        if (!$server.Contains($anchor)) { throw 'Khong tim thay diem dang ky module. Chua thay doi app.' }
        $registration = 'const initExportExcel = require("./export-excel")(app,{pool,auth,ceo});' + [Environment]::NewLine + $anchor
        $server = $server.Replace($anchor,$registration)
    }
    if ($server -notmatch '\.then\(initExportExcel\)') {
        if (!$server.Contains('.then(initLocal)')) { throw 'Khong tim thay chuoi khoi tao module. Chua thay doi app.' }
        $server = $server.Replace('.then(initLocal)','.then(initLocal).then(initExportExcel)')
    }
    if ($server -notmatch 'const\s+initUserUpdate') {
        $anchor = 'const initLocal ='
        if (!$server.Contains($anchor)) { throw 'Khong tim thay diem dang ky cap nhat tai khoan.' }
        $registration = 'const initUserUpdate = require("./user-update")(app,{pool,auth,ceo});' + [Environment]::NewLine + $anchor
        $server = $server.Replace($anchor,$registration)
    }
    if ($server -notmatch '\.then\(initUserUpdate\)') {
        if (!$server.Contains('.then(initLocal)')) { throw 'Khong tim thay chuoi khoi tao cap nhat tai khoan.' }
        $server = $server.Replace('.then(initLocal)','.then(initLocal).then(initUserUpdate)')
    }

    if ($server -notmatch 'leaders\s*=\s*\(u\)\s*=>\s*u\.department\s*===\s*["'']Ban quản trị["'']') {
        $changed = [regex]::Replace(
            $server,
            '(?m)^(\s*leaders\s*=\s*\(u\)\s*=>\s*)(.*)$',
            '${1}u.department === "Ban quản trị" || $2',
            1
        )
        if ($changed -eq $server) { throw 'Khong tim thay khai bao leaders. Chua thay doi app.' }
        $server = $changed
    }
    if ($server -notmatch 'all\s*=\s*u\.department\s*===\s*["'']Ban quản trị["'']') {
        $changed = [regex]::Replace(
            $server,
            '(?m)^(\s*all\s*=\s*)(.*)$',
            '${1}u.department === "Ban quản trị" || $2',
            1
        )
        if ($changed -eq $server) { throw 'Khong tim thay khai bao all. Chua thay doi app.' }
        $server = $changed
    }
    if ($server -notmatch '\.then\(initExportExcel\)' -or $server -notmatch '\.then\(initUserUpdate\)' -or
        $server -notmatch 'leaders\s*=\s*\(u\)\s*=>\s*u\.department\s*===\s*"Ban quản trị"' -or
        $server -notmatch 'all\s*=\s*u\.department\s*===\s*"Ban quản trị"') {
        throw 'Ma nguon nang cap chua dat yeu cau. Chua thay doi app.'
    }

    foreach ($name in @('export-ui','device-install','user-update','reload-ui')) {
        $pattern = '<script[^>]+src="(?:\./)?' + $name + '\.js[^" ]*"[^>]*></script>'
        $index = [regex]::Replace($index,$pattern,'')
        $index = $index.Replace('</body>',('<script src="' + $name + '.js?v=1.11.5"></script></body>'))
    }

    Write-Host '[3/7] Sao luu PostgreSQL va ho so...'
    & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $backupScript
    if ($LASTEXITCODE -ne 0) { throw 'Sao luu du lieu that bai. Chua thay doi app.' }

    Write-Host '[4/7] Sao luu ma nguon hien tai...'
    $backup = Join-Path $target ('backups\upgrade-1.11.5-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
    New-Item -ItemType Directory -Path $backup -Force | Out-Null
    Copy-Item -LiteralPath $serverPath -Destination (Join-Path $backup 'server.js')
    Copy-Item -LiteralPath $indexPath -Destination (Join-Path $backup 'index.html')
    Copy-Item -LiteralPath $agentRoutesPath -Destination (Join-Path $backup 'agent-routes.js')
    Copy-Item -LiteralPath $editRoutesPath -Destination (Join-Path $backup 'edit-work.js')
    Copy-Item -LiteralPath $editUiPath -Destination (Join-Path $backup 'edit-work-ui.js')
    Copy-Item -LiteralPath $manifestPath -Destination (Join-Path $backup 'manifest.json')

    Write-Host '[5/7] Cap nhat giao viec, nguoi phu trach va cac module quan tri...'
    $utf8 = New-Object System.Text.UTF8Encoding($false)
    [IO.File]::WriteAllText($serverPath,$server,$utf8)
    [IO.File]::WriteAllText($indexPath,$index,$utf8)
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'agent-routes.js') -Destination $agentRoutesPath -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'edit-work.js') -Destination $editRoutesPath -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'export-excel.js') -Destination (Join-Path $target 'export-excel.js') -Force
    Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'user-update.js') -Destination (Join-Path $target 'user-update.js') -Force
    foreach ($file in @('edit-work.js','export-ui.js','device-install.js','user-update.js','reload-ui.js','manifest.json','app-icon.svg','app-icon-192.png','app-icon-512.png')) {
        Copy-Item -LiteralPath (Join-Path $PSScriptRoot ('public\' + $file)) -Destination (Join-Path $target ('public\' + $file)) -Force
    }

    Write-Host '[6/7] Build va kiem tra cu phap trong image...'
    Set-Location -LiteralPath $target
    $ErrorActionPreference = 'Continue'
    docker compose --progress plain build app
    $buildExit = $LASTEXITCODE
    if ($buildExit -eq 0) {
        docker compose run --rm --no-deps --entrypoint sh app -c 'node --check server.js && node --check agent-routes.js && node --check edit-work.js && node --check export-excel.js && node --check user-update.js'
        $checkExit = $LASTEXITCODE
    } else {
        $checkExit = 1
    }
    $ErrorActionPreference = 'Stop'
    if ($buildExit -ne 0 -or $checkExit -ne 0) {
        Restore-MndSource -BackupPath $backup
        throw 'Build hoac kiem tra cu phap that bai. Da khoi phuc ma nguon cu; container dang chay chua bi thay.'
    }

    Write-Host '[7/7] Khoi dong va kiem tra suc khoe...'
    $ErrorActionPreference = 'Continue'
    docker compose up -d --no-deps app
    $startExit = $LASTEXITCODE
    $ErrorActionPreference = 'Stop'
    if ($startExit -ne 0) {
        Restore-MndSource -BackupPath $backup
        $ErrorActionPreference = 'Continue'
        docker compose --progress plain build app
        if ($LASTEXITCODE -eq 0) { docker compose up -d --no-deps app }
        $ErrorActionPreference = 'Stop'
        throw 'Khoi dong loi. Da phuc hoi va khoi dong lai ban cu. Gui docker logs --tail 60 mnd-os-app-1.'
    }
    $healthy = $false
    for ($i=0; $i -lt 20; $i++) {
        try {
            $health = Invoke-RestMethod 'http://127.0.0.1:3200/health' -TimeoutSec 3
            if ($health.status -eq 'healthy') { $healthy = $true; break }
        } catch {}
        Start-Sleep -Seconds 2
    }
    if (!$healthy) {
        Restore-MndSource -BackupPath $backup
        $ErrorActionPreference = 'Continue'
        docker compose --progress plain build app
        if ($LASTEXITCODE -eq 0) { docker compose up -d --no-deps app }
        $ErrorActionPreference = 'Stop'
        throw 'App moi chua healthy. Da phuc hoi va khoi dong lai ban cu. Gui docker logs --tail 60 mnd-os-app-1.'
    }

    Write-Host 'NANG CAP 1.11.5 RC THANH CONG.' -ForegroundColor Green
    Write-Host 'Da bo sung nut Tai lai du lieu cho tat ca phong ban.'
    Write-Host 'Giao viec: da lay ca nhan su va tai khoan dang nhap dung phong ban.'
    Write-Host ('Ma nguon truoc nang cap: ' + $backup)
} catch {
    Write-Host ''
    Write-Host 'NANG CAP CHUA THANH CONG:' -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
