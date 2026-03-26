# Restart all services
Write-Host "🔄 Restarting all services..." -ForegroundColor Yellow
docker compose restart
Write-Host "✅ Services restarted" -ForegroundColor Green
