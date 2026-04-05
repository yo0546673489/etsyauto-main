Set-Location $PSScriptRoot
$env:PYTHONIOENCODING = "utf-8"
$env:PYTHONUTF8 = "1"

$env:INTERNAL_API_KEY = "16b72da1ef604967ac041896b58d53ec"
$env:GEMINI_API_KEY = "AIzaSyDdCiJVdVm11I7bZXBrsyO1THt1E0vJuQ8"
$env:PHOTOROOM_API_KEY = "sk_pr_etsy_2c0ad57760dd48bb40ef2c22fd2ed04d328caa10"
$env:ETSY_API_KEY = "2cervnvhc9e9kkrhyenwu09u"
$env:ETSY_API_SECRET = "bme4ns6soo"
$env:DATABASE_URL = "postgresql://postgres:postgres_dev_password@185.241.4.225:5433/etsy_platform"

& "C:\Program Files\Python311\python.exe" server.py
