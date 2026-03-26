# Start all services
Write-Host "🚀 Starting all services..." -ForegroundColor Cyan
docker compose up -d
Write-Host "✅ Services started!" -ForegroundColor Green
Write-Host ""
Write-Host "Access points:" -ForegroundColor Yellow
Write-Host "  Frontend: http://localhost:3000" -ForegroundColor White
Write-Host "  API Docs: http://localhost:8080/docs" -ForegroundColor White
Write-Host ""
Write-Host "View logs with: .\logs.ps1" -ForegroundColor Cyan
