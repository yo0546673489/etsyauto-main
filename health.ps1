# Check health of all services
Write-Host "🏥 Checking service health..." -ForegroundColor Cyan
Write-Host ""

# Check Docker
Write-Host "Docker Status:" -ForegroundColor Yellow
docker compose ps
Write-Host ""

# Check API
Write-Host "API Health:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:8080/healthz" -UseBasicParsing
    $json = $response.Content | ConvertFrom-Json
    Write-Host "✅ API: $($json.status)" -ForegroundColor Green
} catch {
    Write-Host "❌ API not responding" -ForegroundColor Red
}
Write-Host ""

# Check Frontend
Write-Host "Frontend:" -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000" -UseBasicParsing -TimeoutSec 5
    Write-Host "✅ Frontend: Status $($response.StatusCode)" -ForegroundColor Green
} catch {
    Write-Host "❌ Frontend not responding" -ForegroundColor Red
}
Write-Host ""

# Check Database
Write-Host "Database:" -ForegroundColor Yellow
$dbCheck = docker compose exec -T db pg_isready -U postgres 2>$null
if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ Database: Ready" -ForegroundColor Green
} else {
    Write-Host "❌ Database not ready" -ForegroundColor Red
}
Write-Host ""

# Check Redis
Write-Host "Redis:" -ForegroundColor Yellow
$redisCheck = docker compose exec -T redis redis-cli ping 2>$null
if ($redisCheck -match "PONG") {
    Write-Host "✅ Redis: $redisCheck" -ForegroundColor Green
} else {
    Write-Host "❌ Redis not responding" -ForegroundColor Red
}
