# Pulls the latest commits from origin/main, automatically stashing and
# restoring any local changes (like a NUM_FACES override for single-panel
# bring-up) so a local edit never silently blocks the pull.
#
# Usage: powershell -ExecutionPolicy Bypass -File sync.ps1

$ErrorActionPreference = "Stop"

Write-Host "==> Checking for local changes..."
$status = git status --porcelain
$hadLocalChanges = -not [string]::IsNullOrWhiteSpace($status)

if ($hadLocalChanges) {
    Write-Host "==> Stashing local changes..."
    git stash
}

Write-Host "==> Pulling origin/main..."
git pull origin main

if ($hadLocalChanges) {
    Write-Host "==> Reapplying local changes..."
    git stash pop
}

Write-Host ""
Write-Host "==> Done. Now at:"
git log --oneline -1
