@echo off
cd /d "%~dp0"
javac --add-modules jdk.httpserver LughFilmServer.java
if errorlevel 1 pause & exit /b 1
java --add-modules jdk.httpserver LughFilmServer
