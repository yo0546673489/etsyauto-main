# Build and restart etsy-messages
# Using PowerShell to handle Hebrew path

$ErrorActionPreference = "Stop"
$messagesDir = "C:\etsy\`u{05D4}`u{05D5}`u{05D3}`u{05E2}`u{05D5}`u{05EA}"

# Check if the directory exists
if (-not (Test-Path $messagesDir)) {
    # Try alternate encoding
    $dirs = Get-ChildItem "C:\etsy" -Directory
    $messagesDir = ($dirs | Where-Object { $_.Name -match "." -and $_.Name.Length -gt 3 -and $_.Name -notmatch "^[a-zA-Z]" } | Select-Object -First 1).FullName
    Write-Host "Found messages dir: $messagesDir"
}

Write-Host "Building in: $messagesDir"
Set-Location $messagesDir

# Run tsc
$tscPath = Join-Path $messagesDir "node_modules\.bin\tsc.cmd"
Write-Host "TSC path: $tscPath"

& $tscPath
if ($LASTEXITCODE -ne 0) {
    Write-Error "TypeScript build failed!"
    exit 1
}

Write-Host "Build successful!"

# Restart PM2
$pm2 = "C:\Users\Administrator\AppData\Roaming\npm\node_modules\pm2\bin\pm2"
$node = "C:\Program Files\nodejs\node.exe"
& $node $pm2 restart etsy-messages
Write-Host "PM2 restarted!"
