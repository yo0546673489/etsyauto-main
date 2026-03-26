# Stop all services
Write-Host "🛑 Stopping all services..." -ForegroundColor Yellow
docker compose down
Write-Host "✅ Services stopped" -ForegroundColor Green
