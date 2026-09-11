$ErrorActionPreference="Stop"
Write-Host "Mo truy cap LAN cho Mai Nha Dep OS - chi cong TCP 3200" -ForegroundColor Cyan
$Admin=([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if(-not $Admin){Write-Host "Dang yeu cau quyen Administrator...";Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"";exit}
if(Get-NetFirewallRule -DisplayName "Mai Nha Dep OS LAN 3200" -ErrorAction SilentlyContinue){Write-Host "Quy tac Firewall da ton tai." -ForegroundColor Yellow}else{New-NetFirewallRule -DisplayName "Mai Nha Dep OS LAN 3200" -Direction Inbound -Protocol TCP -LocalPort 3200 -Action Allow -Profile Private | Out-Null}
$Ip=(Get-NetIPAddress -AddressFamily IPv4 | Where-Object {$_.InterfaceAlias -notmatch 'Loopback|vEthernet' -and $_.IPAddress -notlike '169.254*'} | Select-Object -First 1 -ExpandProperty IPAddress)
Write-Host "Da mo truy cap LAN an toan." -ForegroundColor Green
Write-Host "May khac/dien thoai cung Wi-Fi mo: http://${Ip}:3200" -ForegroundColor Cyan
Write-Host "Khong mo cong 3200 truc tiep tren modem Internet."
