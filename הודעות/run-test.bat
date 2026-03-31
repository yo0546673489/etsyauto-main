@echo off
SET PATH=C:\Program Files\nodejs;%PATH%
cd /d "C:\etsy\הודעות"
"C:\Program Files\nodejs\node.exe" "C:\Program Files\nodejs\node_modules\npm\bin\npx-cli.js" tsx scripts/test-e2e.ts
