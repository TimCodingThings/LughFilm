# Refresh the local copies discovered on this machine without reinstalling or changing projects.
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$install = 'C:\Users\timsw\AppData\Local\LughFilm'
$downloadInstaller = 'C:\Users\timsw\Downloads\LughFilm-Setup.exe'
$shortcut = 'C:\Users\timsw\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Unknown\LughFilm.lnk'
$java = 'C:\Program Files\Microsoft\jdk-21.0.12.8-hotspot\bin\javaw.exe'
$sourceJar = Join-Path $root 'dist\LughFilm\app\lughfilm.jar'
$sourceInstaller = Join-Path $root 'dist\LughFilm-Setup.exe'
$installedJar = Join-Path $install 'app\lughfilm.jar'
$installedLauncher = Join-Path $install 'start-lughfilm.bat'
$nativeLauncher = Join-Path $install 'LughFilm.exe'
$appMetadata = @(
    @((Join-Path $root 'dist\LughFilm\app\LughFilm.cfg'),(Join-Path $install 'app\LughFilm.cfg')),
    @((Join-Path $root 'dist\LughFilm\app\.jpackage.xml'),(Join-Path $install 'app\.jpackage.xml')),
    @((Join-Path $root 'dist\LughFilm\LughFilm.exe'),$nativeLauncher)
)
foreach ($required in @($sourceJar,$sourceInstaller,$installedJar,$java,(Join-Path $root 'start-lughfilm.bat'))) {
    if (!(Test-Path -LiteralPath $required -PathType Leaf)) { throw "Required update file is missing: $required" }
}
if ((Resolve-Path -LiteralPath $install).Path -ne $install) { throw 'Unexpected installation path' }
if ((Get-Item -LiteralPath $install).LinkType -or (Get-Item -LiteralPath (Join-Path $install 'app')).LinkType) { throw 'Refusing a linked installation directory' }
$signature = Get-AuthenticodeSignature -LiteralPath $java
if ($signature.Status -ne 'Valid') { throw 'The compatible Java launcher must have a valid signature' }
& (Join-Path $root 'audit-editor-sync.ps1') -Builds

$backup = Join-Path $root ('.lughfilm-backups\manual-update-backup-' + (Get-Date -Format 'yyyyMMdd-HHmmss'))
New-Item -ItemType Directory -Path $backup | Out-Null
Copy-Item -LiteralPath $installedJar -Destination (Join-Path $backup 'installed-lughfilm.jar')
if (Test-Path -LiteralPath $installedLauncher) { Copy-Item -LiteralPath $installedLauncher -Destination (Join-Path $backup 'start-lughfilm.bat') }
if (Test-Path -LiteralPath $downloadInstaller) { Copy-Item -LiteralPath $downloadInstaller -Destination (Join-Path $backup 'downloaded-LughFilm-Setup.exe') }
if (Test-Path -LiteralPath $shortcut) { Copy-Item -LiteralPath $shortcut -Destination (Join-Path $backup 'LughFilm.lnk') }
foreach ($pair in $appMetadata) {
    if (!(Test-Path -LiteralPath $pair[0])) { throw "Missing app metadata: $($pair[0])" }
    if (Test-Path -LiteralPath $pair[1]) { Copy-Item -LiteralPath $pair[1] -Destination (Join-Path $backup ([IO.Path]::GetFileName($pair[1]))) }
}

# Only stop the LughFilm processes belonging to this installation.
$running = @(Get-CimInstance Win32_Process | Where-Object {
    ($_.Name -eq 'LughFilm.exe' -and $_.ExecutablePath -eq $nativeLauncher) -or
    ($_.Name -in @('java.exe','javaw.exe') -and $_.CommandLine -like ('*' + $installedJar + '*'))
})
foreach ($process in $running) { Stop-Process -Id $process.ProcessId -Force }
for ($attempt=0;$attempt -lt 30;$attempt++) {
    $listener = Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction SilentlyContinue
    if (!$listener) { break }
    if ($attempt -eq 29) { throw 'Port 8765 is still in use; no installation files have been replaced' }
    Start-Sleep -Milliseconds 200
}
Copy-Item -LiteralPath $sourceJar -Destination $installedJar -Force
Copy-Item -LiteralPath (Join-Path $root 'start-lughfilm.bat') -Destination $installedLauncher -Force
Copy-Item -LiteralPath $sourceInstaller -Destination $downloadInstaller -Force
foreach ($pair in $appMetadata) {
    Copy-Item -LiteralPath $pair[0] -Destination $pair[1] -Force
    if ((Get-FileHash -LiteralPath $pair[0]).Hash -ne (Get-FileHash -LiteralPath $pair[1]).Hash) { throw "App metadata copy failed: $($pair[1])" }
}
foreach ($pair in @(@($sourceJar,$installedJar),@($sourceInstaller,$downloadInstaller),@((Join-Path $root 'start-lughfilm.bat'),$installedLauncher))) {
    if ((Get-FileHash -LiteralPath $pair[0]).Hash -ne (Get-FileHash -LiteralPath $pair[1]).Hash) { throw "Copy verification failed: $($pair[1])" }
}

# Launch Java's signed executable directly, using the installed JAR and downloader paths.
$launchArguments = '--add-modules jdk.httpserver "-Djpackage.app-path=' + $nativeLauncher + '" -Dfile.encoding=UTF-8 -cp "' + $installedJar + '" LughFilmServer'
if (Test-Path -LiteralPath $shortcut) {
    $shell = New-Object -ComObject WScript.Shell
    $link = $shell.CreateShortcut($shortcut)
    $link.TargetPath = $java
    $link.Arguments = $launchArguments
    $link.WorkingDirectory = $install
    $link.IconLocation = $nativeLauncher + ',0'
    $link.Save()
    $verify = $shell.CreateShortcut($shortcut)
    if ($verify.TargetPath -ne $java -or $verify.Arguments -ne $launchArguments) { throw 'Start Menu shortcut verification failed' }
}
$started = Start-Process -FilePath $java -ArgumentList $launchArguments -WorkingDirectory $install -WindowStyle Hidden -PassThru

Add-Type -AssemblyName System.IO.Compression.FileSystem
$jar = [IO.Compression.ZipFile]::OpenRead($installedJar)
try {
    $entry = $jar.GetEntry('lughfilm.html')
    if (!$entry) { throw 'Installed JAR has no HTML' }
    $stream = $entry.Open(); $buffer = [IO.MemoryStream]::new()
    try { $stream.CopyTo($buffer); $installedHtml = $buffer.ToArray() }
    finally { $stream.Dispose(); $buffer.Dispose() }
} finally { $jar.Dispose() }
$sha = [Security.Cryptography.SHA256]::Create()
try {
    $sourceHash = [BitConverter]::ToString($sha.ComputeHash([IO.File]::ReadAllBytes((Join-Path $root 'lughfilm.html'))))
    if ($sourceHash -ne [BitConverter]::ToString($sha.ComputeHash($installedHtml))) { throw 'Installed HTML differs from source' }
    for ($attempt=0;$attempt -lt 30;$attempt++) {
        try {
            $response = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8765/lughfilm.html' -TimeoutSec 3
            if ($response.StatusCode -eq 200) { break }
        } catch { if ($attempt -eq 29) { throw }; Start-Sleep -Milliseconds 300 }
    }
    $live = [IO.MemoryStream]::new()
    try { $response.RawContentStream.Position=0; $response.RawContentStream.CopyTo($live); $liveHash=[BitConverter]::ToString($sha.ComputeHash($live.ToArray())) }
    finally { $live.Dispose() }
    if ($sourceHash -ne $liveHash) { throw 'Live app HTML differs from source' }
    $owner = @(Get-NetTCPConnection -LocalPort 8765 -State Listen -ErrorAction Stop)
    if (!$owner -or @($owner | Where-Object { $_.OwningProcess -ne $started.Id }).Count) { throw 'The live server is not owned by the compatible launcher just started' }
    [pscustomobject]@{
        InstalledJar=$installedJar
        DownloadedInstaller=$downloadInstaller
        CompatibleLauncher=$java
        StartMenuShortcut=$shortcut
        ProcessId=$started.Id
        HttpStatus=$response.StatusCode
        HtmlSha256=$sourceHash.Replace('-','')
        Backup=$backup
    } | ConvertTo-Json
} finally { $sha.Dispose() }
