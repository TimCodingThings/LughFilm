param([string]$Version)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$versionLabel = [regex]::Match([IO.File]::ReadAllText((Join-Path $root 'lughfilm.html')), '<meta name="application-version" content="([^"]+)">')
if (!$versionLabel.Success) { throw 'Missing application-version label in lughfilm.html' }
$labelVersion = $versionLabel.Groups[1].Value
if (!$Version) { $Version = $labelVersion }
if ($Version -ne $labelVersion) { throw "Build version $Version differs from the app label $labelVersion. Update the HTML application-version first." }
$build = Join-Path $root "build-lughfilm"
$inputDir = Join-Path $build "input"
$classes = Join-Path $build "classes"
$dist = Join-Path $root "dist"
$installer = Join-Path $dist "LughFilm-Setup.exe"

# Validate generated targets before removing any previous build output.
foreach ($relative in @('build-lughfilm','dist\LughFilm','dist\LughFilm-Setup.exe','dist\LughFilm-Windows.zip')) {
    $target = [IO.Path]::GetFullPath((Join-Path $root $relative))
    $workspacePrefix = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'
    if (!$target.StartsWith($workspacePrefix, [StringComparison]::OrdinalIgnoreCase)) { throw "Output is outside the workspace: $target" }
    if (Test-Path -LiteralPath $target) {
        $resolved = (Resolve-Path -LiteralPath $target).Path
        # OneDrive uses reparse points for ordinary folders; reject actual links.
        if ($resolved -ne $target -or (Get-Item -LiteralPath $target).LinkType) { throw "Unsafe build output: $target" }
    }
}

Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $dist "LughFilm") -ErrorAction SilentlyContinue
Remove-Item -Force $installer -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $inputDir, $classes, $dist | Out-Null

javac --add-modules jdk.httpserver -d $classes (Join-Path $root "LughFilmServer.java")
Copy-Item (Join-Path $root "lughfilm.html") (Join-Path $classes "lughfilm.html")
Copy-Item (Join-Path $root "assets\lughfilm-icon.png") (Join-Path $classes "lughfilm-icon.png")
jar --create --file (Join-Path $inputDir "lughfilm.jar") --main-class LughFilmServer -C $classes .

jpackage --type app-image --name LughFilm --app-version $Version --input $inputDir --main-jar lughfilm.jar --main-class LughFilmServer --add-modules java.base,java.desktop,jdk.httpserver --dest $dist --icon (Join-Path $root "assets\lughfilm-icon.ico") --java-options "-Dfile.encoding=UTF-8"

$bundledYtDlp = Join-Path $root "vendor\yt-dlp.exe"
$bundledDeno = Join-Path $root "vendor\deno.exe"
if (!(Test-Path -LiteralPath $bundledDeno)) { throw "Missing vendor/deno.exe: YouTube imports require the Deno JavaScript runtime." }
Copy-Item -LiteralPath $bundledDeno -Destination (Join-Path $dist "LughFilm\app\deno.exe")
$ytDlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
if (Test-Path $bundledYtDlp) { Copy-Item $bundledYtDlp (Join-Path $dist "LughFilm\app\yt-dlp.exe") }
elseif ($ytDlp) { Copy-Item $ytDlp.Source (Join-Path $dist "LughFilm\app\yt-dlp.exe") }

$bundledFfmpeg = Join-Path $root "vendor\ffmpeg.exe"
$bundledFfprobe = Join-Path $root "vendor\ffprobe.exe"
$ffmpegLicense = Join-Path $root "vendor\FFmpeg-LICENSE.txt"
if (Test-Path $bundledFfmpeg) { Copy-Item $bundledFfmpeg (Join-Path $dist "LughFilm\app\ffmpeg.exe") }
if (Test-Path $bundledFfprobe) { Copy-Item $bundledFfprobe (Join-Path $dist "LughFilm\app\ffprobe.exe") }
if (Test-Path $ffmpegLicense) { Copy-Item $ffmpegLicense (Join-Path $dist "LughFilm\app\FFmpeg-LICENSE.txt") }

$wix = Join-Path $root "vendor\wix314"
if (!(Test-Path -LiteralPath (Join-Path $wix "light.exe"))) {
    $wixArchive = Join-Path $root "vendor\wix314-binaries.zip"
    New-Item -ItemType Directory -Force (Split-Path $wixArchive) | Out-Null
    Invoke-WebRequest -UseBasicParsing "https://github.com/wixtoolset/wix3/releases/download/wix3141rtm/wix314-binaries.zip" -OutFile $wixArchive
    Expand-Archive -LiteralPath $wixArchive -DestinationPath $wix -Force
}
$env:PATH = "$wix;$env:PATH"
jpackage --type exe --name LughFilm --app-image (Join-Path $dist "LughFilm") --dest $dist --app-version $Version --vendor "LughFilm" --description "Private, on-device video review studio" --win-per-user-install --win-dir-chooser --win-menu --win-shortcut-prompt --win-upgrade-uuid "c4a71dc1-bd17-473b-9a9c-9b0d334375a3"
$generatedInstaller = Join-Path $dist "LughFilm-$Version.exe"
if (!(Test-Path -LiteralPath $generatedInstaller)) { throw "jpackage did not create $generatedInstaller" }
Move-Item -LiteralPath $generatedInstaller -Destination $installer

$zip = Join-Path $dist "LughFilm-Windows.zip"
Remove-Item -Force $zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $dist "LughFilm") -DestinationPath $zip -CompressionLevel Optimal
# Keep repository downloads below GitHub's per-file limit; the app image still includes Deno.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = $null
for ($attempt = 1; $attempt -le 20 -and !$archive; $attempt++) {
    try { $archive = [IO.Compression.ZipFile]::Open($zip, 'Update') }
    catch [IO.IOException] {
        if ($attempt -eq 20) { throw }
        Start-Sleep -Milliseconds 500
    }
}
try {
    $entry = $archive.Entries | Where-Object { $_.FullName -match '[/\\]deno.exe$' }
    if (!$entry) { throw "Deno is missing from the package." }
    $entry.Delete()
} finally { $archive.Dispose() }
Compress-Archive -LiteralPath $bundledDeno -DestinationPath (Join-Path $dist "LughFilm-Deno.zip") -CompressionLevel Optimal -Force
Write-Host "Built $installer and $zip"
