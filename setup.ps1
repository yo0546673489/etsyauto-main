# Etsy Automation Platform - Windows Setup Script
# Run this in PowerShell: .\setup.ps1

Write-Host "🔧 Setting up Etsy Automation Platform..." -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker..." -ForegroundColor Yellow
try {
    docker --version | Out-Null
    Write-Host "✅ Docker found" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker not found. Please install Docker Desktop first." -ForegroundColor Red
    Write-Host "Download from: https://www.docker.com/products/docker-desktop" -ForegroundColor Yellow
    exit 1
}

# Check if Docker is running
$dockerRunning = docker ps 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Docker is not running. Please start Docker Desktop." -ForegroundColor Red
    exit 1
}
Write-Host "✅ Docker is running" -ForegroundColor Green
Write-Host ""

# Create .env file
Write-Host "Creating .env file..." -ForegroundColor Yellow
if (Test-Path .env) {
    Write-Host "⚠️  .env already exists, skipping..." -ForegroundColor Yellow
} else {
    Copy-Item .env.example .env
    Write-Host "✅ Created .env file" -ForegroundColor Green
}
Write-Host ""

# Generate JWT keys
Write-Host "Generating JWT keys..." -ForegroundColor Yellow
if ((Test-Path private.pem) -and (Test-Path public.pem)) {
    Write-Host "⚠️  JWT keys already exist, skipping..." -ForegroundColor Yellow
} else {
    # Check if OpenSSL is available
    $opensslAvailable = $false
    try {
        openssl version | Out-Null
        $opensslAvailable = $true
    } catch {
        Write-Host "⚠️  OpenSSL not found on PATH" -ForegroundColor Yellow
    }

    if ($opensslAvailable) {
        openssl genrsa -out private.pem 2048 2>$null
        openssl rsa -in private.pem -pubout -out public.pem 2>$null
        Write-Host "✅ JWT keys generated" -ForegroundColor Green
    } else {
        Write-Host "⚠️  OpenSSL not found. You need to generate JWT keys manually." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "Option 1: Install OpenSSL" -ForegroundColor Cyan
        Write-Host "  Download from: https://slproweb.com/products/Win32OpenSSL.html" -ForegroundColor White
        Write-Host ""
        Write-Host "Option 2: Use Git Bash - if you have Git installed" -ForegroundColor Cyan
        Write-Host "  Open Git Bash and run:" -ForegroundColor White
        Write-Host "  openssl genrsa -out private.pem 2048" -ForegroundColor White
        Write-Host "  openssl rsa -in private.pem -pubout -out public.pem" -ForegroundColor White
        Write-Host ""
        Write-Host "Option 3: Use WSL - Windows Subsystem for Linux" -ForegroundColor Cyan
        Write-Host "  Run these commands in WSL:" -ForegroundColor White
        Write-Host "  openssl genrsa -out private.pem 2048" -ForegroundColor White
        Write-Host "  openssl rsa -in private.pem -pubout -out public.pem" -ForegroundColor White
        Write-Host ""
        Write-Host "For now, we will continue without JWT keys. You can add them later." -ForegroundColor Yellow
    }
}
Write-Host ""

# Update .env with random secrets if keys exist
if ((Test-Path private.pem) -and (Test-Path public.pem)) {
    Write-Host "Updating .env with JWT keys..." -ForegroundColor Yellow
    $privateKey = Get-Content private.pem -Raw
    $publicKey = Get-Content public.pem -Raw
    
    # Read .env
    $envContent = Get-Content .env
    
    # Update JWT keys (remove newlines)
    $privateKeyOneLine = $privateKey -replace "`r`n", "" -replace "`n", ""
    $publicKeyOneLine = $publicKey -replace "`r`n", "" -replace "`n", ""
    
    $envContent = $envContent -replace "JWT_PRIVATE_KEY=.*", "JWT_PRIVATE_KEY=$privateKeyOneLine"
    $envContent = $envContent -replace "JWT_PUBLIC_KEY=.*", "JWT_PUBLIC_KEY=$publicKeyOneLine"
    
    # Generate random NEXTAUTH_SECRET
    $bytes = New-Object byte[] 32
    [Security.Cryptography.RNGCryptoServiceProvider]::Create().GetBytes($bytes)
    $nextAuthSecret = [Convert]::ToBase64String($bytes)
    $envContent = $envContent -replace "NEXTAUTH_SECRET=.*", "NEXTAUTH_SECRET=$nextAuthSecret"
    
    # Save .env
    $envContent | Set-Content .env
    Write-Host "✅ Updated .env with keys" -ForegroundColor Green
}
Write-Host ""

# Build Docker images
Write-Host "Building Docker images..." -ForegroundColor Yellow
Write-Host "This may take 5-10 minutes on first run..." -ForegroundColor Cyan
docker compose build
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Build failed" -ForegroundColor Red
    exit 1
}
Write-Host "✅ Images built successfully" -ForegroundColor Green
Write-Host ""

# Start services
Write-Host "Starting all services..." -ForegroundColor Yellow
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Failed to start services" -ForegroundColor Red
    exit 1
}
Write-Host "✅ All services started" -ForegroundColor Green
Write-Host ""

# Wait for services to be ready
Write-Host "Waiting for services to be ready..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Check health
Write-Host "Checking service health..." -ForegroundColor Yellow
$maxAttempts = 6
$attempt = 0
$healthy = $false

while ($attempt -lt $maxAttempts -and -not $healthy) {
    try {
        $response = Invoke-WebRequest -Uri "http://localhost:8080/healthz" -UseBasicParsing -TimeoutSec 5
        if ($response.StatusCode -eq 200) {
            $healthy = $true
            Write-Host "✅ API is healthy" -ForegroundColor Green
        }
    } catch {
        $attempt++
        if ($attempt -lt $maxAttempts) {
            Write-Host "⏳ Waiting for API... attempt $attempt of $maxAttempts" -ForegroundColor Yellow
            Start-Sleep -Seconds 5
        }
    }
}

if (-not $healthy) {
    Write-Host "⚠️  API not responding yet. It may still be starting..." -ForegroundColor Yellow
    Write-Host "Check logs with: docker compose logs api" -ForegroundColor Cyan
}

Write-Host ""
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host "✅ SETUP COMPLETE!" -ForegroundColor Green
Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Green
Write-Host ""
Write-Host "🎨 Frontend Dashboard:  http://localhost:3000" -ForegroundColor Cyan
Write-Host "🔌 API Documentation:   http://localhost:8080/docs" -ForegroundColor Cyan
Write-Host "📊 Grafana:             http://localhost:3001 - login: admin/admin" -ForegroundColor Cyan
Write-Host "📈 Prometheus:          http://localhost:9090" -ForegroundColor Cyan
Write-Host ""
Write-Host "Useful commands:" -ForegroundColor Yellow
Write-Host "  .\start.ps1          - Start all services" -ForegroundColor White
Write-Host "  .\stop.ps1           - Stop all services" -ForegroundColor White
Write-Host "  .\logs.ps1           - View logs" -ForegroundColor White
Write-Host "  docker compose ps    - Check service status" -ForegroundColor White
Write-Host ""
Write-Host "Next steps:" -ForegroundColor Yellow
Write-Host "  1. Open http://localhost:3000 in your browser" -ForegroundColor White
Write-Host "  2. Read QUICK_START.md for more information" -ForegroundColor White
Write-Host "  3. Check NEXT_STEPS.md to start development" -ForegroundColor White
Write-Host ""
Write-Host "Happy coding! 🚀" -ForegroundColor Green