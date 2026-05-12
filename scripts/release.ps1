[CmdletBinding()]
param(
    [string]$Version = "",
    [switch]$SkipTests,
    [switch]$NoCommit,
    [switch]$NoTag,
    [switch]$Push
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

function Get-FullPath {
    param([Parameter(Mandatory = $true)][string]$Path)
    return [System.IO.Path]::GetFullPath($Path)
}

function Get-ScriptBase {
    $scriptBase = $PSScriptRoot
    if (-not [string]::IsNullOrWhiteSpace($scriptBase)) {
        return $scriptBase
    }

    if (-not [string]::IsNullOrWhiteSpace($MyInvocation.MyCommand.Path)) {
        return (Split-Path -Parent $MyInvocation.MyCommand.Path)
    }

    return (Get-Location).Path
}

function Assert-PathExists {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Description
    )

    if (-not (Test-Path -LiteralPath $Path)) {
        throw "$Description not found: $Path"
    }
}

function Resolve-RepoRoot {
    param([Parameter(Mandatory = $true)][string]$ScriptBase)

    $candidate = Get-FullPath (Join-Path $ScriptBase "..")
    if (Test-Path -LiteralPath (Join-Path $candidate "js\package.json")) {
        return $candidate
    }

    $candidate = Get-FullPath $ScriptBase
    if (Test-Path -LiteralPath (Join-Path $candidate "js\package.json")) {
        return $candidate
    }

    throw "Could not locate the SDK repo root. Run this script from the repo root or execute the file directly."
}

function Get-CommandPath {
    param([Parameter(Mandatory = $true)][string]$CommandName)

    if ($CommandName -eq "npm" -and $env:OS -eq "Windows_NT") {
        $resolved = Get-Command "npm.cmd" -ErrorAction SilentlyContinue
        if ($null -ne $resolved) {
            return $resolved.Source
        }
    }

    $command = Get-Command $CommandName -ErrorAction Stop
    return $command.Source
}

function Invoke-ExternalCommand {
    param(
        [Parameter(Mandatory = $true)][string[]]$Command,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory
    )

    $executable = Get-CommandPath -CommandName $Command[0]
    $arguments = @()
    if ($Command.Count -gt 1) {
        $arguments = $Command[1..($Command.Count - 1)]
    }

    Write-Host "> $($Command -join ' ')"
    Push-Location $WorkingDirectory
    try {
        & $executable @arguments
        if ($LASTEXITCODE -ne 0) {
            throw "Command failed with exit code ${LASTEXITCODE}: $($Command -join ' ')"
        }
    } finally {
        Pop-Location
    }
}

function Get-JsonVersion {
    param([Parameter(Mandatory = $true)][string]$Path)
    return (Get-Content -LiteralPath $Path -Raw | ConvertFrom-Json).version
}

function Get-PyprojectVersion {
    param([Parameter(Mandatory = $true)][string]$Path)

    $content = Get-Content -LiteralPath $Path -Raw
    $match = [regex]::Match($content, '(?m)^version = "([^"]+)"$')
    if (-not $match.Success) {
        throw "Could not read version from $Path"
    }
    return $match.Groups[1].Value
}

function Rewrite-Regex {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $true)][string]$Replacement
    )

    Assert-PathExists -Path $Path -Description "Editable file"
    $content = Get-Content -LiteralPath $Path -Raw
    $match = [regex]::Match($content, $Pattern)
    if (-not $match.Success) {
        throw "Pattern not found in $Path"
    }
    $updated = [regex]::Replace($content, $Pattern, $Replacement, 1)
    if ($updated -eq $content) {
        return
    }
    Set-Content -LiteralPath $Path -Value $updated -NoNewline
}

function Rewrite-PyprojectVersion {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [Parameter(Mandatory = $true)][string]$Version
    )

    Assert-PathExists -Path $Path -Description "Python project manifest"
    $content = Get-Content -LiteralPath $Path -Raw
    $pattern = '(?m)^[ \t]*version[ \t]*=[ \t]*"[^"]+"[ \t]*$'
    $match = [regex]::Match($content, $pattern)
    if (-not $match.Success) {
        throw "Could not update version in $Path"
    }
    if ($match.Value -eq ('version = "{0}"' -f $Version)) {
        return
    }
    $updated = [regex]::Replace($content, $pattern, ('version = "{0}"' -f $Version), 1)
    if ($updated -eq $content) {
        throw "Could not update version in $Path"
    }
    Set-Content -LiteralPath $Path -Value $updated -NoNewline
}

function Reset-Directory {
    param([Parameter(Mandatory = $true)][string]$Path)

    if (Test-Path -LiteralPath $Path) {
        Remove-Item -LiteralPath $Path -Recurse -Force
    }
    New-Item -ItemType Directory -Path $Path | Out-Null
}

function Sync-ControlPlaneSandboxSdk {
    param(
        [Parameter(Mandatory = $true)][string]$SdkRepoRoot,
        [Parameter(Mandatory = $true)][string]$Version
    )

    $controlPlaneRepoRoot = Get-FullPath (Join-Path $SdkRepoRoot "..\cortex-control-plane")
    $sdkBrowserDistPath = Join-Path $SdkRepoRoot "js\dist\browser"
    $sandboxVendorRoot = Join-Path $controlPlaneRepoRoot "control-plane\website\static\sandbox\vendors\cortex-sdk"
    $sandboxVendorBrowserRoot = Join-Path $sandboxVendorRoot "browser"
    $versionMetadataPath = Join-Path $sandboxVendorRoot "version.json"

    if (-not (Test-Path -LiteralPath $controlPlaneRepoRoot)) {
        Write-Host "Skipping Control Plane sandbox SDK sync: repo not found at $controlPlaneRepoRoot"
        return
    }

    if (-not (Test-Path -LiteralPath $sandboxVendorBrowserRoot)) {
        Write-Host "Skipping Control Plane sandbox SDK sync: vendor path not found at $sandboxVendorBrowserRoot"
        return
    }

    Assert-PathExists -Path $sdkBrowserDistPath -Description "Built browser SDK dist"

    Write-Host "Syncing Control Plane sandbox SDK vendor"
    Push-Location $SdkRepoRoot
    try {
        & robocopy $sdkBrowserDistPath $sandboxVendorBrowserRoot /MIR | Out-Null
        if ($LASTEXITCODE -gt 7) {
            throw "robocopy failed while syncing Control Plane sandbox SDK vendor"
        }
    } finally {
        Pop-Location
    }
    Get-ChildItem -Path $sandboxVendorBrowserRoot -Recurse -File -Include *.d.ts, *.d.ts.map, *.js.map, client.js, index.js, types.js |
        Remove-Item -Force
    Get-ChildItem -Path $sandboxVendorBrowserRoot -Recurse -File -Filter *.js | ForEach-Object {
        $content = Get-Content -LiteralPath $_.FullName -Raw
        $normalizedContent = $content -replace '(?m)^[ \t]*//# sourceMappingURL=.*\r?\n?', ''
        if ($normalizedContent -ne $content) {
            Set-Content -LiteralPath $_.FullName -Value $normalizedContent -NoNewline
        }
    }

    $versionMetadata = @{
        name    = "@cortex-suite/sdk"
        version = $Version
        source  = "cortex-sdk/js/dist/browser"
    } | ConvertTo-Json
    Set-Content -LiteralPath $versionMetadataPath -Value $versionMetadata
}

function Get-GitStatusLines {
    param([Parameter(Mandatory = $true)][string]$RepoRoot)

    Push-Location $RepoRoot
    try {
        $output = & git status --porcelain
        if ($LASTEXITCODE -ne 0) {
            throw "git status failed in $RepoRoot"
        }
        return @($output | Where-Object { $_ -ne "" })
    } finally {
        Pop-Location
    }
}

function Test-LocalTagExists {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$TagName
    )

    Push-Location $RepoRoot
    try {
        & git rev-parse -q --verify "refs/tags/$TagName" | Out-Null
        return ($LASTEXITCODE -eq 0)
    } finally {
        Pop-Location
    }
}

function Test-RemoteTagExists {
    param(
        [Parameter(Mandatory = $true)][string]$RepoRoot,
        [Parameter(Mandatory = $true)][string]$TagName
    )

    Push-Location $RepoRoot
    try {
        $output = & git ls-remote --tags origin "refs/tags/$TagName"
        if ($LASTEXITCODE -ne 0) {
            throw "git ls-remote failed while checking tag $TagName"
        }
        return -not [string]::IsNullOrWhiteSpace(($output | Out-String).Trim())
    } finally {
        Pop-Location
    }
}

$scriptBase = Get-ScriptBase
$repoRoot = Resolve-RepoRoot -ScriptBase $scriptBase

$jsPackagePath = Join-Path $repoRoot "js\package.json"
$pyprojectPath = Join-Path $repoRoot "python\pyproject.toml"
$publicIndexPath = Join-Path $repoRoot "docs\public\index.md"
$pythonDistPath = Join-Path $repoRoot "python\dist"

Assert-PathExists -Path $jsPackagePath -Description "JS package manifest"
Assert-PathExists -Path $pyprojectPath -Description "Python project manifest"
Assert-PathExists -Path $publicIndexPath -Description "Public docs index"

if (-not [string]::IsNullOrWhiteSpace($Version)) {
    if ($Version -notmatch '^\d+\.\d+\.\d+(-[0-9A-Za-z.-]+)?$') {
        throw "Version must look like semantic versioning, for example 1.0.1 or 1.1.0-rc.1"
    }

    Write-Host "Updating release version to $Version"
    Invoke-ExternalCommand -Command @("npm", "version", $Version, "--no-git-tag-version", "--allow-same-version") -WorkingDirectory (Join-Path $repoRoot "js")
    Rewrite-PyprojectVersion -Path $pyprojectPath -Version $Version
    Rewrite-Regex -Path $publicIndexPath -Pattern '(?m)^\*\*Version:\*\* .+$' -Replacement ('**Version:** {0}' -f $Version)
}

$jsVersion = Get-JsonVersion -Path $jsPackagePath
$pythonVersion = Get-PyprojectVersion -Path $pyprojectPath

if ($jsVersion -ne $pythonVersion) {
    throw "Version mismatch: js/package.json=$jsVersion python/pyproject.toml=$pythonVersion"
}

$releaseVersion = $jsVersion
$tagName = "v$releaseVersion"

Write-Host "Preparing release $tagName"

Invoke-ExternalCommand -Command @("npm", "--prefix", "js", "ci") -WorkingDirectory $repoRoot
if (-not $SkipTests) {
    Invoke-ExternalCommand -Command @("npm", "--prefix", "js", "test") -WorkingDirectory $repoRoot
}
Invoke-ExternalCommand -Command @("npm", "--prefix", "js", "run", "build") -WorkingDirectory $repoRoot
Invoke-ExternalCommand -Command @("npm", "--prefix", "js", "run", "smoke") -WorkingDirectory $repoRoot
Sync-ControlPlaneSandboxSdk -SdkRepoRoot $repoRoot -Version $releaseVersion

Invoke-ExternalCommand -Command @("python", "-m", "pip", "install", "-e", "./python[dev]") -WorkingDirectory $repoRoot
if (-not $SkipTests) {
    Invoke-ExternalCommand -Command @("python", "-m", "pytest", "python/tests") -WorkingDirectory $repoRoot
}

Write-Host "Resetting python/dist for a clean build"
Reset-Directory -Path $pythonDistPath
Invoke-ExternalCommand -Command @("python", "-m", "build", "python") -WorkingDirectory $repoRoot

if (-not $NoCommit) {
    $statusLines = Get-GitStatusLines -RepoRoot $repoRoot
    $versionFiles = @(
        $statusLines | Where-Object { $_ -match '(js/package\.json|python/pyproject\.toml|docs/public/index\.md)' }
    )

    if ($versionFiles.Count -gt 0) {
        Write-Host "Committing version bump"
        Invoke-ExternalCommand -Command @("git", "add", "--",
            "js/package.json", "python/pyproject.toml", "docs/public/index.md") -WorkingDirectory $repoRoot

        Push-Location $repoRoot
        try {
            & git diff --cached --quiet -- "js/package.json" "python/pyproject.toml" "docs/public/index.md"
            $hasStagedChanges = ($LASTEXITCODE -ne 0)
        } finally {
            Pop-Location
        }

        if ($hasStagedChanges) {
            Invoke-ExternalCommand -Command @("git", "commit", "-m", "Release $tagName") -WorkingDirectory $repoRoot
        } else {
            Write-Host "No version changes staged; commit step skipped."
        }
    } else {
        Write-Host "No version files changed; commit step skipped."
    }
} else {
    Write-Host "Commit step skipped because -NoCommit was passed."
}

if (-not $NoTag) {
    if (Test-LocalTagExists -RepoRoot $repoRoot -TagName $tagName) {
        throw "Local tag already exists: $tagName"
    }
    if ($Push -and (Test-RemoteTagExists -RepoRoot $repoRoot -TagName $tagName)) {
        throw "Remote tag already exists on origin: $tagName"
    }

    Write-Host "Creating tag $tagName"
    Invoke-ExternalCommand -Command @("git", "tag", "-a", $tagName, "-m", "Release $tagName") -WorkingDirectory $repoRoot
} else {
    Write-Host "Tag step skipped because -NoTag was passed."
}

if ($Push) {
    Push-Location $repoRoot
    try {
        $currentBranch = (& git branch --show-current | Out-String).Trim()
        if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($currentBranch)) {
            throw "Could not determine current branch."
        }
    } finally {
        Pop-Location
    }

    Write-Host "Pushing release to origin"
    Invoke-ExternalCommand -Command @("git", "push", "origin", $currentBranch) -WorkingDirectory $repoRoot
    if (-not $NoTag) {
        Invoke-ExternalCommand -Command @("git", "push", "origin", $tagName) -WorkingDirectory $repoRoot
    }
}

Write-Host ""
Write-Host "Release flow completed."
Write-Host "Version: $releaseVersion"
if ($Push) {
    Write-Host "Pushed: yes"
} else {
    Write-Host "Pushed: no (run with -Push to push branch and tag to origin)"
    Write-Host "CI will build and publish once the tag is pushed."
}
