Write-Host '=== Close ==='
Invoke-RestMethod -Uri 'http://127.0.0.1:50325/api/v1/browser/stop?user_id=k16kmi55' | ConvertTo-Json
Start-Sleep -Seconds 3

Write-Host '=== Status ==='
Invoke-RestMethod -Uri 'http://127.0.0.1:50325/api/v1/browser/active?user_id=k16kmi55' | ConvertTo-Json
Start-Sleep -Seconds 1

Write-Host '=== Open ==='
Invoke-RestMethod -Uri 'http://127.0.0.1:50325/api/v1/browser/start?user_id=k16kmi55' | ConvertTo-Json -Depth 5
