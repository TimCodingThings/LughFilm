$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$build = Join-Path $root "build-lughfilm"
$inputDir = Join-Path $build "input"
$classes = Join-Path $build "classes"
$dist = Join-Path $root "dist"

Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $dist "LughFilm") -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $inputDir, $classes, $dist | Out-Null

javac --add-modules jdk.httpserver -d $classes (Join-Path $root "LughFilmServer.java")
Copy-Item (Join-Path $root "lughfilm.html") (Join-Path $classes "lughfilm.html")
Copy-Item (Join-Path $root "assets\lughfilm-icon.png") (Join-Path $classes "lughfilm-icon.png")
jar --create --file (Join-Path $inputDir "lughfilm.jar") --main-class LughFilmServer -C $classes .

jpackage --type app-image --name LughFilm --input $inputDir --main-jar lughfilm.jar --main-class LughFilmServer --add-modules java.base,java.desktop,jdk.httpserver --dest $dist --icon (Join-Path $root "assets\lughfilm-icon.ico") --java-options "-Dfile.encoding=UTF-8"

$bundledYtDlp = Join-Path $root "vendor\yt-dlp.exe"
$ytDlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
if (Test-Path $bundledYtDlp) { Copy-Item $bundledYtDlp (Join-Path $dist "LughFilm\app\yt-dlp.exe") }
elseif ($ytDlp) { Copy-Item $ytDlp.Source (Join-Path $dist "LughFilm\app\yt-dlp.exe") }

$bundledFfmpeg = Join-Path $root "vendor\ffmpeg.exe"
$bundledFfprobe = Join-Path $root "vendor\ffprobe.exe"
$ffmpegLicense = Join-Path $root "vendor\FFmpeg-LICENSE.txt"
if (Test-Path $bundledFfmpeg) { Copy-Item $bundledFfmpeg (Join-Path $dist "LughFilm\app\ffmpeg.exe") }
if (Test-Path $bundledFfprobe) { Copy-Item $bundledFfprobe (Join-Path $dist "LughFilm\app\ffprobe.exe") }
if (Test-Path $ffmpegLicense) { Copy-Item $ffmpegLicense (Join-Path $dist "LughFilm\app\FFmpeg-LICENSE.txt") }

$zip = Join-Path $dist "LughFilm-Windows.zip"
Remove-Item -Force $zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $dist "LughFilm") -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Built $zip"
