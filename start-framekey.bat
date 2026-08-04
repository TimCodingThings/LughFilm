@echo off
cd /d "%~dp0"
start "" http://127.0.0.1:8765
javac --add-modules jdk.httpserver FramekeyServer.java
if errorlevel 1 pause & exit /b 1
java --add-modules jdk.httpserver FramekeyServer
