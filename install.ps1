# BandReady, the browser edition, for Windows.
#
#   irm https://raw.githubusercontent.com/Luxshan2000/ielts-prep/main/install.ps1 | iex
#
# For when the .exe installer is blocked or unwanted. Installs into your user folder only:
# no administrator rights, no Node, no git, and no Python of your own (uv downloads one just
# for BandReady). Run the same line again to update.
#
# $env:BANDREADY_WHEEL = '<path or URL>'  install that build instead of the latest release
# $env:BANDREADY_NO_LAUNCH = '1'          install only, do not start BandReady afterwards
#
# Written for Windows PowerShell 5.1, the version every Windows 10 and 11 machine has.

$ErrorActionPreference = 'Stop'
$Repo = 'Luxshan2000/ielts-prep'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Stop-Install([string]$Message) {
    Write-Host ''
    Write-Host "BandReady could not be installed: $Message" -ForegroundColor Red
    Write-Host "If this keeps happening, please report it at https://github.com/$Repo/issues"
    throw $Message
}

# 1. uv, which installs Python and BandReady without touching the rest of the system.
$uvCommand = Get-Command uv -ErrorAction SilentlyContinue
if ($uvCommand) {
    $uv = $uvCommand.Source
} else {
    $uv = Join-Path $env:USERPROFILE '.local\bin\uv.exe'
    if (-not (Test-Path $uv)) {
        Write-Host 'Installing uv, the tool that sets up Python for BandReady...'
        $env:UV_NO_MODIFY_PATH = '1'
        try {
            Invoke-RestMethod https://astral.sh/uv/install.ps1 | Invoke-Expression | Out-Null
        } catch {
            Stop-Install 'uv did not install. Check your internet connection.'
        }
    }
    if (-not (Test-Path $uv)) { Stop-Install "uv installed, but $uv is missing." }
}

# 2. The build to install: the newest release that has a browser edition attached.
if ($env:BANDREADY_WHEEL) {
    $wheel = $env:BANDREADY_WHEEL
} else {
    Write-Host 'Finding the latest BandReady release...'
    $releases = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases?per_page=10"
    $asset = $releases | ForEach-Object { $_.assets } | Where-Object { $_.name -like '*.whl' } | Select-Object -First 1
    if (-not $asset) { Stop-Install "no release with a browser edition was found at https://github.com/$Repo/releases" }
    $wheel = $asset.browser_download_url
}
if ($wheel -notmatch '^[a-z]+://') {
    $wheel = 'file:///' + ((Resolve-Path $wheel).Path -replace '\\', '/')
}

# uv warns that its bin folder is not on PATH, which means nothing to someone who has never
# opened a terminal. It is on PATH for this script, and `update-shell` adds it for later.
$binDir = (& $uv tool dir --bin).Trim()
$env:Path = "$binDir;$env:Path"

Write-Host 'Installing BandReady. The first time downloads about 800 MB, so this can take a while...'
& $uv tool install --force --reinstall-package bandready-sidecar --python 3.11 "bandready-sidecar[voice] @ $wheel"
if ($LASTEXITCODE -ne 0) {
    Stop-Install 'the download or install did not finish. Check your internet connection and run the line again.'
}
# uv reports on stderr even when it succeeds. Windows PowerShell 5.1 turns redirected
# stderr into an error, which 'Stop' then makes fatal, after a finished install.
$ErrorActionPreference = 'Continue'
& $uv tool update-shell *> $null
$ErrorActionPreference = 'Stop'

$bin = Join-Path $binDir 'bandready.exe'
if (-not (Test-Path $bin)) { Stop-Install "the install finished but $bin is missing." }

# 3. Something to click next time: Start menu and desktop shortcuts.
$iconDir = Join-Path $env:LOCALAPPDATA 'BandReady'
New-Item -ItemType Directory -Force -Path $iconDir | Out-Null
$icon = Join-Path $iconDir 'icon.ico'
try {
    Invoke-WebRequest "https://raw.githubusercontent.com/$Repo/main/app/build/icon.ico" -OutFile $icon -UseBasicParsing
} catch {
    $icon = $null
}
$shell = New-Object -ComObject WScript.Shell
$places = @(
    (Join-Path ([Environment]::GetFolderPath('Programs')) 'BandReady.lnk'),
    (Join-Path ([Environment]::GetFolderPath('Desktop')) 'BandReady.lnk')
)
foreach ($place in $places) {
    $link = $shell.CreateShortcut($place)
    $link.TargetPath = $bin
    $link.Description = 'IELTS practice that runs on your own computer'
    if ($icon) { $link.IconLocation = $icon }
    $link.Save()
}

Write-Host ''
Write-Host 'BandReady is installed.'
Write-Host 'Next time, open BandReady from the Start menu or the desktop shortcut.'
Write-Host ''

if (-not $env:BANDREADY_NO_LAUNCH) {
    & $bin
}
