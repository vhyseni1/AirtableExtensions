<#
.SYNOPSIS
    Builds and releases the Feature Management extension to Airtable.

.DESCRIPTION
    Wraps `block release` from @airtable/blocks-cli with the preflight checks
    that actually catch mistakes: wrong Node, missing remote pairing, missing
    personal access token, a dirty working tree, and lint failures. Nothing is
    uploaded until every check passes.

    Run it from anywhere — it operates on its own directory, so the space in
    "feature management" is handled.

.PARAMETER Remote
    Named remote to release to. Maps to .block/<Remote>.remote.json.
    Omit to use the default .block/remote.json.

.PARAMETER Comment
    Release note stored with the release (max 1000 chars, truncated if longer).
    Defaults to "<branch>@<short-sha> — <timestamp>".

.PARAMETER SkipLint
    Skip `npm run lint`. Use only when you have already run it.

.PARAMETER Force
    Release even though the git working tree has uncommitted changes.
    Refused by default: what you ship should match a commit.

.PARAMETER CliVersion
    Version of @airtable/blocks-cli to run. Pinned so a CLI release cannot
    change your build without you choosing it.

.EXAMPLE
    .\release.ps1
    Release to the default remote with an auto-generated comment.

.EXAMPLE
    .\release.ps1 -Remote prod -Comment "Executive review stories deck"

.EXAMPLE
    .\release.ps1 -SkipLint -Force
    Release the current working tree as-is (for a hotfix you are watching).

.NOTES
    Requires a personal access token with the block:manage scope, created at
    https://airtable.com/create/tokens and stored by `block set-api-key`.
    Custom extensions require a paid (Team+) Airtable plan.
#>

[CmdletBinding()]
param(
    [string]$Remote,
    [string]$Comment,
    [switch]$SkipLint,
    [switch]$Force,
    [string]$CliVersion = '3.0.3'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# ─── Helpers ─────────────────────────────────────────────────────────────────

function Write-Step  { param([string]$Message) Write-Host "`n▶ $Message" -ForegroundColor Cyan }
function Write-Ok    { param([string]$Message) Write-Host "  ✓ $Message" -ForegroundColor Green }
function Write-Note  { param([string]$Message) Write-Host "  · $Message" -ForegroundColor DarkGray }
function Write-Warn  { param([string]$Message) Write-Host "  ! $Message" -ForegroundColor Yellow }

function Stop-WithError {
    param([string]$Message, [string]$Fix)
    Write-Host "`n✗ $Message" -ForegroundColor Red
    if ($Fix) { Write-Host "  Fix: $Fix" -ForegroundColor Yellow }
    exit 1
}

# Resolve an executable, preferring the .cmd shim npm installs on Windows.
function Resolve-Tool {
    param([string]$Name)
    foreach ($candidate in @("$Name.cmd", $Name)) {
        $cmd = Get-Command $candidate -CommandType Application -ErrorAction SilentlyContinue |
               Select-Object -First 1
        if ($cmd) { return $cmd.Source }
    }
    return $null
}

# Run a native command and stop the script if it exits non-zero. PowerShell does
# not throw on native exit codes, so this has to be explicit.
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$FailureMessage = 'Command failed.',
        [string]$Fix
    )
    Write-Note "$([System.IO.Path]::GetFileName($FilePath)) $($Arguments -join ' ')"
    & $FilePath @Arguments
    if ($LASTEXITCODE -ne 0) {
        Stop-WithError "$FailureMessage (exit code $LASTEXITCODE)" $Fix
    }
}

# ─── 0. Work from the extension directory ────────────────────────────────────

$projectRoot = $PSScriptRoot
if (-not $projectRoot) { $projectRoot = (Get-Location).Path }
Push-Location -LiteralPath $projectRoot
try {

Write-Host "Airtable extension release" -ForegroundColor White
Write-Note "Directory: $projectRoot"

# ─── 1. Toolchain ────────────────────────────────────────────────────────────

Write-Step 'Checking toolchain'

$node = Resolve-Tool 'node'
if (-not $node) { Stop-WithError 'Node.js was not found on PATH.' 'Install the current Node LTS from https://nodejs.org and reopen the terminal.' }

$npm = Resolve-Tool 'npm'
if (-not $npm) { Stop-WithError 'npm was not found on PATH.' 'It ships with Node.js — reinstall Node, or repair your PATH.' }

$npx = Resolve-Tool 'npx'
if (-not $npx) { Stop-WithError 'npx was not found on PATH.' 'It ships with npm 5.2+ — reinstall Node.js.' }

$nodeVersion = (& $node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
# ESLint 9 in this repo requires Node ^18.18 || ^20.9 || >=21.1. The CLI itself
# declares >=10, but the build toolchain is the binding constraint.
if ($nodeMajor -lt 18) {
    Stop-WithError "Node $nodeVersion is too old for this project's toolchain (ESLint 9 needs 18.18+)." 'Install the current Node LTS from https://nodejs.org.'
}
Write-Ok "Node $nodeVersion"

# ─── 2. Project shape ────────────────────────────────────────────────────────

Write-Step 'Checking project'

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'block.json'))) {
    Stop-WithError 'block.json is missing — this is not an extension root.' "Run the script from inside the extension folder."
}
Write-Ok 'block.json found'

# .block/remote.json is the base<->extension pairing the CLI uploads against.
# A named remote lives at .block/<name>.remote.json.
$remoteFile = if ($Remote) { "$Remote.remote.json" } else { 'remote.json' }
$remotePath = Join-Path $projectRoot (Join-Path '.block' $remoteFile)
if (-not (Test-Path -LiteralPath $remotePath)) {
    $existing = @()
    if (Test-Path -LiteralPath (Join-Path $projectRoot '.block')) {
        $existing = @(Get-ChildItem -LiteralPath (Join-Path $projectRoot '.block') -Filter '*.json' -ErrorAction SilentlyContinue |
                      Select-Object -ExpandProperty Name)
    }
    if ($existing.Count -gt 0) { Write-Warn "Remotes present in .block: $($existing -join ', ')" }
    Stop-WithError "No remote config at $(Join-Path '.block' $remoteFile)." @'
Pair this folder with the base once:
    In the base: Extensions -> Build a custom extension -> copy the block identifier
    Then run:   npx --yes --package @airtable/blocks-cli block add-remote <blockIdentifier> <remoteName>
                (omit <remoteName> for the default remote)
'@
}
Write-Ok "Remote config: $(Join-Path '.block' $remoteFile)"

# ─── 3. Credentials ──────────────────────────────────────────────────────────
# The CLI reads a personal access token from .airtableblocksrc.json — either in
# this folder (app scope) or in your home directory (user scope). Never commit
# the app-scoped one; .gitignore already excludes it.

Write-Step 'Checking credentials'

$appToken  = Join-Path $projectRoot '.airtableblocksrc.json'
$userToken = Join-Path $HOME '.airtableblocksrc.json'
if (-not (Test-Path -LiteralPath $appToken) -and -not (Test-Path -LiteralPath $userToken)) {
    Stop-WithError 'No Airtable personal access token configured.' @'
Create a token with the block:manage scope at https://airtable.com/create/tokens, then:
    npx --yes --package @airtable/blocks-cli block set-api-key
Paste the token when prompted. It is stored in your home directory, not the repo.
'@
}
Write-Ok ('Token found in {0} scope' -f $(if (Test-Path -LiteralPath $appToken) { 'app' } else { 'user' }))

# ─── 4. Source control state ─────────────────────────────────────────────────

Write-Step 'Checking git state'

$git = Resolve-Tool 'git'
$branch = 'unknown'
$sha = 'unknown'
if ($git) {
    $insideRepo = (& $git rev-parse --is-inside-work-tree 2>$null)
    if ($LASTEXITCODE -eq 0 -and $insideRepo -eq 'true') {
        $branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
        $sha    = (& $git rev-parse --short HEAD).Trim()
        $dirty  = @((& $git status --porcelain -- .) | Where-Object { $_ })
        if ($dirty) {
            if (-not $Force) {
                Write-Host ($dirty -join "`n") -ForegroundColor DarkGray
                Stop-WithError 'Uncommitted changes in the extension folder.' 'Commit them, or re-run with -Force to ship the working tree as-is.'
            }
            Write-Warn "Releasing a dirty working tree ($($dirty.Count) changed file(s)) because -Force was given."
        }
        Write-Ok "On $branch at $sha"
    } else {
        Write-Warn 'Not a git repository — skipping source-control checks.'
    }
} else {
    Write-Warn 'git not found on PATH — skipping source-control checks.'
}

# ─── 5. Dependencies ─────────────────────────────────────────────────────────

Write-Step 'Installing dependencies'

if (Test-Path -LiteralPath (Join-Path $projectRoot 'package-lock.json')) {
    # npm ci is the reproducible install: it fails rather than silently
    # resolving something the lockfile does not describe.
    & $npm ci
    if ($LASTEXITCODE -ne 0) {
        Write-Warn 'npm ci failed (lockfile likely out of sync) — falling back to npm install.'
        Invoke-Native -FilePath $npm -Arguments @('install') -FailureMessage 'npm install failed.'
    }
} else {
    Invoke-Native -FilePath $npm -Arguments @('install') -FailureMessage 'npm install failed.'
}
Write-Ok 'Dependencies installed'

# ─── 6. Lint ─────────────────────────────────────────────────────────────────

if ($SkipLint) {
    Write-Warn 'Lint skipped (-SkipLint).'
} else {
    Write-Step 'Linting'
    Invoke-Native -FilePath $npm -Arguments @('run', 'lint') `
        -FailureMessage 'Lint failed — nothing was uploaded.' `
        -Fix 'Fix the reported problems, or re-run with -SkipLint if you accept them.'
    Write-Ok 'Lint clean'
}

# ─── 7. Release ──────────────────────────────────────────────────────────────

Write-Step 'Releasing to Airtable'

if (-not $Comment) {
    $Comment = "$branch@$sha - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
if ($Comment.Length -gt 1000) {
    $Comment = $Comment.Substring(0, 1000)   # the CLI rejects anything longer
    Write-Warn 'Comment truncated to 1000 characters.'
}

$releaseArgs = @('--yes', '--package', "@airtable/blocks-cli@$CliVersion", 'block', 'release')
if ($Remote)  { $releaseArgs += @('--remote', $Remote) }
$releaseArgs += @('--comment', $Comment)

Write-Note "Comment: $Comment"
Invoke-Native -FilePath $npx -Arguments $releaseArgs `
    -FailureMessage 'block release failed — nothing was published.' `
    -Fix @'
Common causes:
  - Token lacks the block:manage scope, or does not cover this base -> recreate at https://airtable.com/create/tokens
  - The base is on a Free plan -> custom extensions need Team or above
  - The remote points at a deleted extension -> re-pair with block add-remote
Re-run with -Verbose, or run the same command directly, to see the CLI output in full.
'@

Write-Host "`n✓ Released $branch@$sha" -ForegroundColor Green
Write-Note 'Open the base and reload the extension to pick up the new version.'

}
finally {
    Pop-Location
}
