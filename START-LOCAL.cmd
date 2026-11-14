@echo off
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 22.12 or newer, then run this file again.
  pause
  exit /b 1
)
set PORT=4173
set HOST=127.0.0.1
echo ReverseResilia will run at http://127.0.0.1:4173
echo Keep this window open while checking the website.
call npm start
echo.
echo The server stopped. Any startup error is shown above.
pause
