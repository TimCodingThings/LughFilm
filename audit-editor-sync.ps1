param([switch]$Builds)
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$utf8 = [Text.UTF8Encoding]::new($false)
function Digest([byte[]]$bytes) {
    $sha = [Security.Cryptography.SHA256]::Create()
    try { [BitConverter]::ToString($sha.ComputeHash($bytes)).Replace('-','') }
    finally { $sha.Dispose() }
}
function EntryBytes($archive, [string]$name) {
    $entry = $archive.GetEntry($name)
    if (!$entry) { throw "Missing archive entry: $name" }
    $inputStream = $entry.Open()
    $buffer = [IO.MemoryStream]::new()
    try { $inputStream.CopyTo($buffer); return ,$buffer.ToArray() }
    finally { $inputStream.Dispose(); $buffer.Dispose() }
}
$htmlPath = Join-Path $root 'lughfilm.html'
$html = [IO.File]::ReadAllText($htmlPath)
foreach ($block in @(@('style','lugh-editor-v2-style','editor-ui.css'),@('script','lugh-editor-v2-script','editor-core.js'))) {
    $matches = [regex]::Matches($html, '<'+$block[0]+' id="'+$block[1]+'">([\s\S]*?)</'+$block[0]+'>')
    if ($matches.Count -ne 1) { throw "Expected exactly one $($block[1]), found $($matches.Count)" }
    $source = [IO.File]::ReadAllBytes((Join-Path $root $block[2]))
    if ((Digest $source) -ne (Digest ($utf8.GetBytes($matches[0].Groups[1].Value)))) { throw "Embedded source differs: $($block[2])" }
    Write-Host "$($block[2]): one embedded block, byte-for-byte match"
}
$downloadPattern = '<script id="lugh-direct-mp4-download">[\s\S]*?</script>'
$direct = [regex]::Matches($html, $downloadPattern)
if ($direct.Count -ne 1) { throw 'Missing or duplicated direct MP4 downloader' }
$beforeHash = Digest ([IO.File]::ReadAllBytes($htmlPath))
& (Join-Path $root 'sync-editor.ps1')
if ($beforeHash -ne (Digest ([IO.File]::ReadAllBytes($htmlPath)))) { throw 'Synchronization is not idempotent' }
$afterDirect = [regex]::Match([IO.File]::ReadAllText($htmlPath), $downloadPattern).Value
if ($afterDirect -cne $direct[0].Value) { throw 'Synchronization changed the standalone direct MP4 handler' }
Write-Host 'Repeated synchronization leaves the HTML and direct MP4 handler unchanged.'
if ($Builds) {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    foreach ($relative in @('build-lughfilm\input\lughfilm.jar','dist\LughFilm\app\lughfilm.jar')) {
        $jar = [IO.Compression.ZipFile]::OpenRead((Join-Path $root $relative))
        try {
            if ($beforeHash -ne (Digest (EntryBytes $jar 'lughfilm.html'))) { throw "HTML mismatch in $relative" }
            Write-Host "$relative : HTML matches source"
        } finally { $jar.Dispose() }
    }
    $zip = [IO.Compression.ZipFile]::OpenRead((Join-Path $root 'dist\LughFilm-Windows.zip'))
    try {
        $jarEntry = @($zip.Entries | Where-Object { $_.FullName.Replace('\','/') -eq 'LughFilm/app/lughfilm.jar' })
        if ($jarEntry.Count -ne 1) { throw 'Portable ZIP must contain exactly one app JAR' }
        $jarBytes = EntryBytes $zip $jarEntry[0].FullName
        $memory = [IO.MemoryStream]::new($jarBytes, $false)
        $jar = [IO.Compression.ZipArchive]::new($memory, [IO.Compression.ZipArchiveMode]::Read)
        try {
            if ($beforeHash -ne (Digest (EntryBytes $jar 'lughfilm.html'))) { throw 'Portable ZIP HTML differs from source' }
            Write-Host 'Portable ZIP JAR: HTML matches source'
        } finally { $jar.Dispose(); $memory.Dispose() }
    } finally { $zip.Dispose() }
}
Write-Host "Synchronization audit passed. HTML SHA-256: $beforeHash"
