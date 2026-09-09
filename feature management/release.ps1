<#
.SYNOPSIS
    Deploys the Feature Management frontend and releases it to Airtable.

.DESCRIPTION
    Two layouts are supported.

    1. Paired repo. This folder is itself the extension project (it has a
       .block\remote.json). Everything happens here.

    2. Separate project (the usual setup). The repo holds the source; a
       separate folder created by `block init` holds the pairing, the SDK and
       node_modules. Pass -ProjectPath and the script lints here, copies
       frontend\* across, and releases from there - the manual copy-then-
       release routine, with the checks that catch the mistakes it hides.

    Nothing is uploaded until every check passes.

.PARAMETER ProjectPath
    The `block init` project to deploy into and release from, e.g.
    C:\Users\me\features. Omit when this folder is itself the project.

.PARAMETER Remote
    Named remote: .block\<Remote>.remote.json in the release folder.
    Omit for the default .block\remote.json.

.PARAMETER Comment
    Release note (the CLI caps it at 1000 chars; longer is truncated).
    Defaults to "<branch>@<short-sha> - <timestamp>" from the source repo.

.PARAMETER SkipLint
    Skip `npm run lint` in the source folder.

.PARAMETER Force
    Deploy even though the source repo has uncommitted changes. Refused by
    default: what you ship should match a commit.

.PARAMETER WhatIf
    Run every check and report what would be copied and released, then stop
    before changing or uploading anything.

.PARAMETER CliVersion
    Version of @airtable/blocks-cli to run. Pinned so a CLI release cannot
    change your build without you choosing it.

.EXAMPLE
    .\release.ps1 -ProjectPath "C:\Users\lonni\features"

.EXAMPLE
    .\release.ps1 -ProjectPath "C:\Users\lonni\features" -WhatIf
    Show what would be copied and released. Changes nothing.

.EXAMPLE
    .\release.ps1 -Remote prod -Comment "Executive review stories deck"

.NOTES
    Needs a personal access token with the block:manage scope, created at
    https://airtable.com/create/tokens and stored by `block set-api-key`.
    Custom extensions require a paid (Team+) Airtable plan.

    This file is deliberately pure ASCII: Windows PowerShell 5.1 reads a
    BOM-less UTF-8 script as ANSI and would mangle anything else.
#>

[CmdletBinding()]
param(
    [string]$ProjectPath,
    [string]$Remote,
    [string]$Comment,
    [switch]$SkipLint,
    [switch]$Force,
    [switch]$WhatIf,
    [string]$CliVersion = '3.0.3'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# --- Helpers ----------------------------------------------------------------

function Write-Step { param([string]$Message) Write-Host "`n> $Message" -ForegroundColor Cyan }
function Write-Ok   { param([string]$Message) Write-Host "  [ok] $Message" -ForegroundColor Green }
function Write-Note { param([string]$Message) Write-Host "  - $Message" -ForegroundColor DarkGray }
function Write-Warn { param([string]$Message) Write-Host "  ! $Message" -ForegroundColor Yellow }

function Stop-WithError {
    param([string]$Message, [string]$Fix)
    Write-Host "`nERROR: $Message" -ForegroundColor Red
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

# Run a native command in a directory and stop the script if it exits non-zero.
# PowerShell does not throw on native exit codes, so this has to be explicit.
function Invoke-Native {
    param(
        [Parameter(Mandatory)][string]$FilePath,
        [string[]]$Arguments = @(),
        [string]$WorkingDirectory,
        [string]$FailureMessage = 'Command failed.',
        [string]$Fix
    )
    $where = if ($WorkingDirectory) { $WorkingDirectory } else { (Get-Location).Path }
    Write-Note "$([System.IO.Path]::GetFileName($FilePath)) $($Arguments -join ' ')"
    Push-Location -LiteralPath $where
    try {
        & $FilePath @Arguments
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
    }
    if ($code -ne 0) { Stop-WithError "$FailureMessage (exit code $code)" $Fix }
}

# --- 0. Work out the source and release folders -----------------------------

$sourceRoot = $PSScriptRoot
if (-not $sourceRoot) { $sourceRoot = (Get-Location).Path }

if ($ProjectPath) {
    if (-not (Test-Path -LiteralPath $ProjectPath -PathType Container)) {
        Stop-WithError "-ProjectPath '$ProjectPath' does not exist." 'Pass the folder created by block init - the one with block.json and .block in it.'
    }
    $releaseRoot = (Resolve-Path -LiteralPath $ProjectPath).Path
} else {
    $releaseRoot = $sourceRoot
}
$deploying = $releaseRoot -ne $sourceRoot

Write-Host 'Airtable extension release' -ForegroundColor White
Write-Note "Source:  $sourceRoot"
Write-Note "Release: $releaseRoot$(if (-not $deploying) { ' (same folder)' })"
if ($WhatIf) { Write-Warn 'WhatIf: nothing will be copied or uploaded.' }

# --- 1. Toolchain -----------------------------------------------------------

Write-Step 'Checking toolchain'

$node = Resolve-Tool 'node'
if (-not $node) { Stop-WithError 'Node.js was not found on PATH.' 'Install the current Node LTS from https://nodejs.org and reopen the terminal.' }
$npm = Resolve-Tool 'npm'
if (-not $npm) { Stop-WithError 'npm was not found on PATH.' 'It ships with Node.js - reinstall Node, or repair your PATH.' }
$npx = Resolve-Tool 'npx'
if (-not $npx) { Stop-WithError 'npx was not found on PATH.' 'It ships with npm 5.2+ - reinstall Node.js.' }

$nodeVersion = (& $node --version).TrimStart('v')
$nodeMajor = [int]($nodeVersion.Split('.')[0])
# ESLint 9 in this repo needs Node ^18.18 || ^20.9 || >=21.1. The CLI itself
# declares >=10, but the build toolchain is the binding constraint.
if ($nodeMajor -lt 18) {
    Stop-WithError "Node $nodeVersion is too old for this project's toolchain (ESLint 9 needs 18.18+)." 'Install the current Node LTS from https://nodejs.org.'
}
Write-Ok "Node $nodeVersion"

# --- 2. Source folder -------------------------------------------------------

Write-Step 'Checking source'

$sourceFrontend = Join-Path $sourceRoot 'frontend'
if (-not (Test-Path -LiteralPath $sourceFrontend -PathType Container)) {
    Stop-WithError "No frontend folder in $sourceRoot." 'Run the script from the extension source folder in the repo.'
}
$sourceFiles = @(Get-ChildItem -LiteralPath $sourceFrontend -Recurse -File)
Write-Ok "frontend: $($sourceFiles.Count) file(s)"

# --- 3. Release folder: block.json, remote pairing, real ids ----------------

Write-Step 'Checking release target'

if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot 'block.json'))) {
    Stop-WithError "block.json is missing from $releaseRoot - that is not an extension project." @"
If your paired project lives elsewhere (the folder you created with
block init, where you normally run block release), pass it:
    .\release.ps1 -ProjectPath "C:\path\to\that\project"
"@
}
Write-Ok 'block.json found'

# .block\remote.json is the base<->extension pairing the CLI uploads against.
# A named remote lives at .block\<name>.remote.json.
$remoteFile = if ($Remote) { "$Remote.remote.json" } else { 'remote.json' }
$remotePath = Join-Path $releaseRoot (Join-Path '.block' $remoteFile)
if (-not (Test-Path -LiteralPath $remotePath)) {
    $existing = @()
    if (Test-Path -LiteralPath (Join-Path $releaseRoot '.block')) {
        $existing = @(Get-ChildItem -LiteralPath (Join-Path $releaseRoot '.block') -Filter '*.json' -ErrorAction SilentlyContinue |
                      Select-Object -ExpandProperty Name)
    }
    if ($existing.Count -gt 0) { Write-Warn "Remotes present in $releaseRoot\.block : $($existing -join ', ')" }
    Stop-WithError "No remote config at $remotePath." @"
That folder has never been paired with a base. Either point -ProjectPath at the
project you normally release from, or pair this one:

  1. In the base: Extensions -> Add an extension -> Build a custom extension.
     Airtable shows a 'block init <baseId>/<blockId> ' command. Those ids are
     REAL values that look like appXXXXXXXXXXXXXX and blkXXXXXXXXXXXXXX -
     do not paste angle brackets or dots.
  2. npx --yes --package @airtable/blocks-cli@$CliVersion block add-remote <baseId>/<blockId> prod
     The remote name is REQUIRED and writes .block\prod.remote.json.
     Then release with:  .\release.ps1 -Remote prod
     Or write .block\remote.json yourself as {"baseId": "...", "blockId": "..."}
     and pass no -Remote at all.

Do NOT run block init in a folder that already exists - it refuses, and it
would pull a template over your code.
"@
}

# The CLI validates only that the ids START WITH app/blk, so a copy-pasted
# placeholder is written to disk without complaint and does not fail until the
# upload. Catch it here instead.
try {
    $remoteJson = Get-Content -LiteralPath $remotePath -Raw | ConvertFrom-Json
} catch {
    Stop-WithError "$remotePath is not valid JSON." 'Delete it and re-pair, or fix the file by hand.'
}
$baseId  = if ($remoteJson.PSObject.Properties['baseId'])  { [string]$remoteJson.baseId }  else { '' }
$blockId = if ($remoteJson.PSObject.Properties['blockId']) { [string]$remoteJson.blockId } else { '' }

$idFix = @"
Real ids, not placeholders:
  baseId  - the app... segment of the base URL in your browser:
            https://airtable.com/appXXXXXXXXXXXXXX/tbl...
  blockId - shown by the base under
            Extensions -> Add an extension -> Build a custom extension,
            in the 'block init appXXXXXXXXXXXXXX/blkXXXXXXXXXXXXXX' command.
Fix $remotePath so it reads:
  {"baseId": "appXXXXXXXXXXXXXX", "blockId": "blkXXXXXXXXXXXXXX"}
"@

# 'NONE' is the CLI's marker for a V2 extension that runs against any base.
if ($baseId -ne 'NONE' -and $baseId -notmatch '^app[A-Za-z0-9]+$') {
    Stop-WithError "baseId in $remotePath is not a base id: '$baseId'" $idFix
}
if ($blockId -notmatch '^blk[A-Za-z0-9]+$') {
    Stop-WithError "blockId in $remotePath is not an extension id: '$blockId'" $idFix
}
# Airtable ids are conventionally 17 characters. Warn rather than fail - the
# length is a convention, not something the CLI enforces.
if (($baseId -ne 'NONE' -and $baseId.Length -ne 17) -or $blockId.Length -ne 17) {
    Write-Warn "Unusual id length (expected 17 chars): baseId '$baseId', blockId '$blockId'. Continuing."
}
Write-Ok "Remote: $(Join-Path '.block' $remoteFile) [$baseId / $blockId]"

# --- 4. Credentials ---------------------------------------------------------
# The CLI reads a personal access token from .airtableblocksrc.json - in the
# release folder (app scope) or your home directory (user scope).

Write-Step 'Checking credentials'

$appToken  = Join-Path $releaseRoot '.airtableblocksrc.json'
$userToken = Join-Path $HOME '.airtableblocksrc.json'
if (-not (Test-Path -LiteralPath $appToken) -and -not (Test-Path -LiteralPath $userToken)) {
    Stop-WithError 'No Airtable personal access token configured.' @"
Create a token with the block:manage scope at https://airtable.com/create/tokens
(grant it on the base you are deploying to), then run:
    npx --yes --package @airtable/blocks-cli@$CliVersion block set-api-key
and paste the token when prompted. It is stored in your home directory.
"@
}
Write-Ok ('Token found in {0} scope' -f $(if (Test-Path -LiteralPath $appToken) { 'app' } else { 'user' }))

# --- 5. Source control state (source repo, not the release folder) ----------

Write-Step 'Checking git state'

$git = Resolve-Tool 'git'
$branch = 'unknown'
$sha = 'unknown'
if ($git) {
    Push-Location -LiteralPath $sourceRoot
    try {
        $insideRepo = (& $git rev-parse --is-inside-work-tree 2>$null)
        if ($LASTEXITCODE -eq 0 -and $insideRepo -eq 'true') {
            $branch = (& $git rev-parse --abbrev-ref HEAD).Trim()
            $sha    = (& $git rev-parse --short HEAD).Trim()
            $dirty  = @((& $git status --porcelain -- .) | Where-Object { $_ })
            if ($dirty) {
                if (-not $Force -and -not $WhatIf) {
                    Write-Host ($dirty -join "`n") -ForegroundColor DarkGray
                    Stop-WithError 'Uncommitted changes in the source folder.' 'Commit them, or re-run with -Force to ship the working tree as-is.'
                }
                Write-Warn "Source has $($dirty.Count) uncommitted change(s)."
            }
            Write-Ok "On $branch at $sha"
        } else {
            Write-Warn 'Source is not a git repository - skipping source-control checks.'
        }
    } finally {
        Pop-Location
    }
} else {
    Write-Warn 'git not found on PATH - skipping source-control checks.'
}

# --- 6. Lint the source -----------------------------------------------------

if ($SkipLint) {
    Write-Warn 'Lint skipped (-SkipLint).'
} else {
    $sourcePkg = Join-Path $sourceRoot 'package.json'
    $hasLint = $false
    if (Test-Path -LiteralPath $sourcePkg) {
        $pkg = Get-Content -LiteralPath $sourcePkg -Raw | ConvertFrom-Json
        $hasLint = $pkg.PSObject.Properties['scripts'] -and $pkg.scripts.PSObject.Properties['lint']
    }
    if ($hasLint) {
        Write-Step 'Linting source'
        if (-not (Test-Path -LiteralPath (Join-Path $sourceRoot 'node_modules'))) {
            Write-Note 'Installing source dev dependencies (needed for lint).'
            Invoke-Native -FilePath $npm -Arguments @('install') -WorkingDirectory $sourceRoot -FailureMessage 'npm install failed in the source folder.'
        }
        Invoke-Native -FilePath $npm -Arguments @('run', 'lint') -WorkingDirectory $sourceRoot `
            -FailureMessage 'Lint failed - nothing was copied or uploaded.' `
            -Fix 'Fix the reported problems, or re-run with -SkipLint if you accept them.'
        Write-Ok 'Lint clean'
    } else {
        Write-Warn 'No lint script in the source package.json - skipping.'
    }
}

# --- 7. Deploy the frontend into the release project ------------------------

if ($deploying) {
    Write-Step 'Deploying frontend'

    $targetFrontend = Join-Path $releaseRoot 'frontend'
    if (-not (Test-Path -LiteralPath $targetFrontend -PathType Container)) {
        Stop-WithError "No frontend folder in $releaseRoot." 'That does not look like the project you release from - check -ProjectPath.'
    }

    # Files in the target but not in the source: leftovers from an earlier
    # layout. Copy-Item never removes them, and a stale module can still be
    # picked up by the bundler.
    $sourceNames = @($sourceFiles | ForEach-Object { $_.FullName.Substring($sourceFrontend.Length).TrimStart('\', '/') })
    $targetNames = @(Get-ChildItem -LiteralPath $targetFrontend -Recurse -File |
                     ForEach-Object { $_.FullName.Substring($targetFrontend.Length).TrimStart('\', '/') })
    $orphans = @($targetNames | Where-Object { $sourceNames -notcontains $_ })
    if ($orphans.Count -gt 0) {
        Write-Warn "In the target but not in the source (left in place): $($orphans -join ', ')"
        Write-Note 'Delete them by hand if they are from an older layout.'
    }

    if ($WhatIf) {
        Write-Note "Would copy $($sourceFiles.Count) file(s) to $targetFrontend :"
        $sourceNames | ForEach-Object { Write-Note "    $_" }
    } else {
        Copy-Item -Path (Join-Path $sourceFrontend '*') -Destination $targetFrontend -Recurse -Force
        Write-Ok "Copied $($sourceFiles.Count) file(s) to $targetFrontend"
    }
}

# --- 8. Dependencies in the release project ---------------------------------

Write-Step 'Checking release project dependencies'

if (-not (Test-Path -LiteralPath (Join-Path $releaseRoot 'node_modules'))) {
    if ($WhatIf) {
        Write-Note 'Would run npm install in the release project (no node_modules).'
    } else {
        Write-Note 'No node_modules in the release project - installing.'
        Invoke-Native -FilePath $npm -Arguments @('install') -WorkingDirectory $releaseRoot -FailureMessage 'npm install failed in the release project.'
    }
} else {
    Write-Ok 'node_modules present'
}

# --- 9. Release -------------------------------------------------------------

Write-Step 'Releasing to Airtable'

if (-not $Comment) {
    $Comment = "$branch@$sha - $(Get-Date -Format 'yyyy-MM-dd HH:mm')"
}
if ($Comment.Length -gt 1000) {
    $Comment = $Comment.Substring(0, 1000)   # the CLI rejects anything longer
    Write-Warn 'Comment truncated to 1000 characters.'
}

$releaseArgs = @('--yes', '--package', "@airtable/blocks-cli@$CliVersion", 'block', 'release')
if ($Remote) { $releaseArgs += @('--remote', $Remote) }
$releaseArgs += @('--comment', $Comment)

Write-Note "Comment: $Comment"
if ($WhatIf) {
    Write-Note "Would run in $releaseRoot :"
    Write-Note "    npx $($releaseArgs -join ' ')"
    Write-Host "`nWhatIf: stopped before uploading. Nothing changed." -ForegroundColor Yellow
    exit 0
}

Invoke-Native -FilePath $npx -Arguments $releaseArgs -WorkingDirectory $releaseRoot `
    -FailureMessage 'block release failed - nothing was published.' `
    -Fix @"
Common causes:
  - Token lacks the block:manage scope, or was not granted on this base
    -> recreate at https://airtable.com/create/tokens
  - The base is on a Free plan -> custom extensions need Team or above
  - The remote points at a deleted extension -> re-pair with block add-remote
  - A build error in the copied frontend -> the CLI prints it above
"@

Write-Host "`nSUCCESS: released $branch@$sha" -ForegroundColor Green
Write-Note 'Open the base and reload the extension to pick up the new version.'
