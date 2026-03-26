# View logs from all services
Write-Host "📋 Viewing logs... (Press Ctrl+C to exit)" -ForegroundColor Cyan
Write-Host ""
docker compose logs -f
