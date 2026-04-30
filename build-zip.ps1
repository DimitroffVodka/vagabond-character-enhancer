$ErrorActionPreference = 'Stop'

$srcDir = $PSScriptRoot
$tempDir = Join-Path $env:TEMP 'vce-release'
$zipPath = Join-Path $srcDir 'module.zip'

if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item $tempDir -ItemType Directory | Out-Null

# Loose files at zip root
$rootFiles = @('module.json', 'CHANGELOG.md', 'README.md', 'CLAUDE.md')

# Directories to bundle recursively (templates/ is NOT in module.json — Foundry
# loads .hbs at runtime — so it has to be enumerated here. If you add a new
# load-bearing directory, list it here AND in $requiredDirs below.)
$dirs = @('scripts', 'styles', 'languages', 'templates')

foreach ($f in $rootFiles) {
    Copy-Item (Join-Path $srcDir $f) $tempDir
}
foreach ($d in $dirs) {
    Copy-Item (Join-Path $srcDir $d) (Join-Path $tempDir $d) -Recurse
}

# robocopy avoids LevelDB LOCK file errors that Copy-Item -Recurse hits
robocopy (Join-Path $srcDir 'packs') (Join-Path $tempDir 'packs') /E /R:0 /W:0 /NFL /NDL /NJH /NJS | Out-Null

Compress-Archive -Path (Join-Path $tempDir '*') -DestinationPath $zipPath -Force
Remove-Item $tempDir -Recurse -Force

# --- Sanity check: open the zip and verify required content is present ---
# This exists because v0.4.0 through v0.4.2 silently shipped without templates/,
# and the missing files only surfaced at runtime when Foundry tried to render a
# dialog. Catch packaging regressions here, before the zip leaves this script.

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead($zipPath)
try {
    $entries = $zip.Entries | ForEach-Object { $_.FullName -replace '\\', '/' }

    $manifest = Get-Content (Join-Path $srcDir 'module.json') -Raw | ConvertFrom-Json

    # Required entries derived from module.json (load-bearing for Foundry init)
    $requiredFiles = @('module.json')
    $requiredFiles += $manifest.esmodules
    $requiredFiles += $manifest.styles
    $requiredFiles += $manifest.languages | ForEach-Object { $_.path }

    # Plus required directories — at least one file must exist under each
    $requiredDirs = @('scripts/', 'styles/', 'languages/', 'templates/', 'packs/')
    foreach ($pack in $manifest.packs) {
        $requiredDirs += ($pack.path.TrimEnd('/') + '/')
    }

    # Plus every local .hbs in templates/ must be in the zip — guards against
    # someone adding a template but forgetting to include it
    $localTemplates = Get-ChildItem (Join-Path $srcDir 'templates') -Filter *.hbs -File |
        ForEach-Object { "templates/$($_.Name)" }
    $requiredFiles += $localTemplates

    $missingFiles = $requiredFiles | Where-Object { $_ -and ($entries -notcontains $_) }
    $missingDirs  = $requiredDirs  | Where-Object { $d = $_; -not ($entries | Where-Object { $_.StartsWith($d) }) }

    if ($missingFiles -or $missingDirs) {
        Write-Host "BUILD FAILED: module.zip is missing required content" -ForegroundColor Red
        if ($missingFiles) {
            Write-Host "  Missing files:" -ForegroundColor Red
            $missingFiles | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
        }
        if ($missingDirs) {
            Write-Host "  Missing/empty directories:" -ForegroundColor Red
            $missingDirs | ForEach-Object { Write-Host "    - $_" -ForegroundColor Red }
        }
        Remove-Item $zipPath -Force
        exit 1
    }
}
finally {
    $zip.Dispose()
}

$size = [math]::Round((Get-Item $zipPath).Length / 1MB, 2)
Write-Host "Created module.zip ($size MB, $($entries.Count) entries) — verified OK" -ForegroundColor Green
