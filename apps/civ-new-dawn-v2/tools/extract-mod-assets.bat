@echo off
setlocal
cd /d "%~dp0"
python extract-mod.py extract %*
exit /b %errorlevel%
