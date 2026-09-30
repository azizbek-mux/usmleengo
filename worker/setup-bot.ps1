# Points @usmleengo_bot's webhook at this Worker, and sets what people see
# before they type anything: its command lists, the menu button that opens the
# app, and the descriptions on the empty chat and the profile - each in English
# and in Uzbek, which Telegram shows to phones set to Uzbek.
#
#   powershell -ExecutionPolicy Bypass -File worker\setup-bot.ps1
#
# It rotates WEBHOOK_SECRET, because Cloudflare never shows a stored secret
# back: a fresh random value is generated, saved as the Worker's secret, and
# used once to call /bot/setup. The value is never printed and never written
# to a file. Telegram signs every webhook call with that secret, so the bot
# is deaf for the second between the two steps - run this at a quiet moment.

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$secret = node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"
if (-not $secret) { throw "node produced nothing - is node on PATH?" }

Write-Host "1/2  Uploading a new WEBHOOK_SECRET..."
# npx.cmd, not npx: PowerShell's execution policy blocks npm's .ps1 shims.
$secret | & npx.cmd wrangler secret put WEBHOOK_SECRET
if ($LASTEXITCODE -ne 0) { throw "wrangler secret put failed (exit $LASTEXITCODE)" }

Write-Host ""
Write-Host "2/2  Pointing Telegram at the Worker..."
$url = "https://usmleengo-rating.azizbekmuxtorlapt.workers.dev/bot/setup"
$reply = (& curl.exe -s -X POST $url -H "x-setup-key: $secret") -join ""
Write-Host $reply

$ok = ([regex]::Matches($reply, '"ok":true')).Count
Write-Host ""
if ($ok -ge 8) {
  Write-Host "Done - webhook, commands, menu button and descriptions are set." -ForegroundColor Green
  Write-Host "Send /start to @usmleengo_bot to check it answers." -ForegroundColor Green
} else {
  Write-Host "Not finished - the reply above should hold eight ok:true." -ForegroundColor Yellow
}
