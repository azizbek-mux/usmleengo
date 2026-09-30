# A backup of everything usmleengo that is not already safe on GitHub.
#
#   powershell -ExecutionPolicy Bypass -File worker\backup.ps1
#   powershell -ExecutionPolicy Bypass -File worker\backup.ps1 -Folder D:\backups\usmleengo
#
# It writes three things into one dated folder (the Desktop by default):
#   database-DATE.sql     every table of the live rating database, with the
#                         players' names and @usernames: PRIVATE, keep it out
#                         of GitHub and out of any shared folder
#   code-DATE.bundle      the whole git history, every branch, in one file
#                         (restore: git clone code-DATE.bundle usmleengo)
#   local-only-DATE.zip   the small files git deliberately does not keep: the
#                         compiled question bank, the Uzbek sources list, the
#                         glossary and the demo page
# and a MANIFEST.txt that says what is in it and how to bring it back.
#
# It never copies a secret: worker\.dev.vars and .env.local are not on the
# list, and the bot token and setup key live only in Cloudflare (and, for the
# token, GitHub Actions). The source books (Uworld2024, USMLE RESS, nbmes,
# Free120s) are too big to copy here and are not on GitHub either: they need a
# copy on a disk or a drive of their own.
#
# The database also keeps 30 days of point-in-time history at Cloudflare
# itself (wrangler d1 time-travel info usmleengo-rating).
param([string]$Folder = (Join-Path ([Environment]::GetFolderPath("Desktop")) "usmleengo-backup"))

$ErrorActionPreference = "Stop"
$worker = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = Split-Path -Parent $worker
$date = Get-Date -Format "yyyy-MM-dd"
New-Item -ItemType Directory -Force $Folder | Out-Null

Write-Host "1/3  the database"
Push-Location $worker
try {
  $sql = Join-Path $Folder "database-$date.sql"
  npx.cmd wrangler d1 export usmleengo-rating --remote --output="$sql" | Out-Null
  if (-not (Test-Path $sql)) { throw "the database export did not arrive: run 'npx.cmd wrangler login' and try again" }
} finally { Pop-Location }

Write-Host "2/3  the code"
$bundle = Join-Path $Folder "code-$date.bundle"
git -C $repo bundle create $bundle --all | Out-Null

Write-Host "3/3  the files git does not keep"
$keep = @("bank.json", "demo.html", "public\announcement.json", "public\glossary.json", "public\questions.json", "public\questions.uz.json", "src\data\uz\.sources.json") |
  ForEach-Object { Join-Path $repo $_ } | Where-Object { Test-Path $_ }
$zip = Join-Path $Folder "local-only-$date.zip"
if (Test-Path $zip) { Remove-Item $zip }
Compress-Archive -Path $keep -DestinationPath $zip

$rows = (Select-String -Path $sql -Pattern '^INSERT INTO "players"' | Measure-Object).Count
$manifest = @"
usmleengo backup, $date

database-$date.sql    the live rating database ($rows players). PRIVATE: it holds names and @usernames.
                      To bring it back into a NEW database:
                        npx.cmd wrangler d1 create usmleengo-rating-restored
                        npx.cmd wrangler d1 execute usmleengo-rating-restored --remote --file=database-$date.sql
                      then point database_id in worker\wrangler.toml at it and deploy.
                      Cloudflare also keeps 30 days of point-in-time history:
                        npx.cmd wrangler d1 time-travel info usmleengo-rating
code-$date.bundle     the whole git history, every branch. git clone code-$date.bundle usmleengo
local-only-$date.zip  bank.json, questions.json, questions.uz.json, glossary.json, announcement.json,
                      demo.html and src\data\uz\.sources.json: files git does not keep.

NOT in here, on purpose
  the bot token and the setup key   Cloudflare holds them (the token also GitHub Actions). The token can be
                                     replaced in @BotFather (/revoke); the setup key is any long random text.
  worker\.dev.vars, .env.local       local secrets: never copied.
  the source books                   Uworld2024, USMLE RESS, nbmes, Free120s (about 7.5 GB): copy them to an
                                     external drive or a private cloud folder yourself.
"@
Set-Content -Path (Join-Path $Folder "MANIFEST.txt") -Value $manifest -Encoding UTF8
Write-Host "done: $Folder"
Get-ChildItem $Folder | Select-Object Name, Length
