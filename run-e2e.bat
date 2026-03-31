@echo off
SET "PATH=C:\Program Files\nodejs;%PATH%"
"C:\Program Files\nodejs\node.exe" C:\etsy\run-e2e.js > C:\etsy\e2e-output.txt 2>&1
echo Exit code: %ERRORLEVEL% >> C:\etsy\e2e-output.txt
