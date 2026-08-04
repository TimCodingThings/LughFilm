$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$build = Join-Path $root "build-framekey"
$inputDir = Join-Path $build "input"
$classes = Join-Path $build "classes"
$dist = Join-Path $root "dist"

Remove-Item -Recurse -Force $build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force (Join-Path $dist "Framekey") -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force $inputDir, $classes, $dist | Out-Null

javac --add-modules jdk.httpserver -d $classes (Join-Path $root "FramekeyServer.java")
Copy-Item (Join-Path $root "framekey.html") (Join-Path $classes "framekey.html")
jar --create --file (Join-Path $inputDir "framekey.jar") --main-class FramekeyServer -C $classes .

jpackage --type app-image --name Framekey --input $inputDir --main-jar framekey.jar --main-class FramekeyServer --add-modules java.base,java.desktop,jdk.httpserver --dest $dist --win-console --java-options "-Dfile.encoding=UTF-8"

$bundledYtDlp = Join-Path $root "vendor\yt-dlp.exe"
$ytDlp = Get-Command yt-dlp -ErrorAction SilentlyContinue
if (Test-Path $bundledYtDlp) { Copy-Item $bundledYtDlp (Join-Path $dist "Framekey\app\yt-dlp.exe") }
elseif ($ytDlp) { Copy-Item $ytDlp.Source (Join-Path $dist "Framekey\app\yt-dlp.exe") }

$zip = Join-Path $dist "Framekey-Windows.zip"
Remove-Item -Force $zip -ErrorAction SilentlyContinue
Compress-Archive -Path (Join-Path $dist "Framekey") -DestinationPath $zip -CompressionLevel Optimal
Write-Host "Built $zip"
