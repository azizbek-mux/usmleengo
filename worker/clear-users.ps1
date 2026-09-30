# Deletes every player's data from the live database, and leaves the tables.
#
#   powershell -ExecutionPolicy Bypass -File worker\clear-users.ps1 -DryRun    # only counts what is there
#   powershell -ExecutionPolicy Bypass -File worker\clear-users.ps1            # backs up, asks, deletes
#
# What goes: the rating board (players, with their names and @usernames, points
# and streaks), classes and everything in them (members, packages, homework,
# results, pictures) and the question files people sent the bot.
# What stays: the database itself, its tables, the app, the bot and its secrets.
#
# What it cannot do: the app on every phone keeps its own progress (in the
# person's Telegram account). Anyone who opens the app again sends their points
# back and returns to the board. A clean start for a person is Me -> Reset all
# progress on their own phone.
#
# It takes a fresh backup first (worker\backup.ps1), unless -NoBackup. That
# backup holds the very names being deleted: delete the backup folder when you
# are sure you will not restore. Cloudflare itself keeps 30 days of history
# (wrangler d1 time-travel) that nobody can purge earlier.
param([switch]$DryRun, [switch]$NoBackup)

$ErrorActionPreference = "Stop"
$worker = Split-Path -Parent $MyInvocation.MyCommand.Path
# children before the parents they belong to
$tables = @("attempts", "assignments", "packages", "members", "images", "classes", "uploads", "players")

function Count-Rows($table) {
  $out = npx.cmd wrangler d1 execute usmleengo-rating --remote --json --command "SELECT COUNT(*) AS n FROM $table"
  $json = ($out -join "`n") | ConvertFrom-Json
  return [int]$json[0].results[0].n
}

Push-Location $worker
try {
  Write-Host "In the live database now:"
  $total = 0
  foreach ($t in $tables) { $n = Count-Rows $t; $total += $n; Write-Host ("  {0,-12} {1}" -f $t, $n) }
  if ($DryRun) { Write-Host "Dry run: nothing was changed."; return }
  if ($total -eq 0) { Write-Host "Already empty."; return }

  if (-not $NoBackup) { Write-Host "`nBacking up first..."; & (Join-Path $worker "backup.ps1") | Out-Null }

  Write-Host "`nThis deletes all $total rows above from the LIVE database."
  $answer = Read-Host "Type DELETE to go on"
  if ($answer -cne "DELETE") { Write-Host "Cancelled: nothing was changed."; return }

  $sql = ($tables | ForEach-Object { "DELETE FROM $_;" }) -join " "
  npx.cmd wrangler d1 execute usmleengo-rating --remote --yes --command $sql | Out-Null

  Write-Host "`nAfter:"
  foreach ($t in $tables) { Write-Host ("  {0,-12} {1}" -f $t, (Count-Rows $t)) }
  Write-Host "`nDone. The board starts empty; people return to it when they next open the app."
} finally { Pop-Location }
