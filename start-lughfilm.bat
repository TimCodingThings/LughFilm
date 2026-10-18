@echo off
setlocal

set "LUGH_INSTALL=%LOCALAPPDATA%\LughFilm"
set "LUGH_JAVA="

for /d %%D in ("%ProgramFiles%\Microsoft\jdk-*") do (
  if exist "%%~fD\bin\javaw.exe" set "LUGH_JAVA=%%~fD\bin\javaw.exe"
)

if not defined LUGH_JAVA (
  for /f "delims=" %%J in ('where javaw.exe 2^>nul') do if not defined LUGH_JAVA set "LUGH_JAVA=%%J"
)

if defined LUGH_JAVA if exist "%LUGH_INSTALL%\app\lughfilm.jar" (
  start "LughFilm" /D "%LUGH_INSTALL%" "%LUGH_JAVA%" ^
    --add-modules jdk.httpserver ^
    "-Djpackage.app-path=%LUGH_INSTALL%\LughFilm.exe" ^
    -Dfile.encoding=UTF-8 ^
    -cp "%LUGH_INSTALL%\app\lughfilm.jar" ^
    LughFilmServer
  exit /b 0
)

cd /d "%~dp0"
javac --add-modules jdk.httpserver LughFilmServer.java
if errorlevel 1 pause & exit /b 1
java --add-modules jdk.httpserver -Dfile.encoding=UTF-8 LughFilmServer
