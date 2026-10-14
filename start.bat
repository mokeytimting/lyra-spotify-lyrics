@echo off
chcp 65001 >nul
title Lyra
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo 找不到 Node.js，請先到 https://nodejs.org 安裝（LTS 版即可），再重新執行。
  pause
  exit /b 1
)

if not exist node_modules (
  echo 第一次執行，正在安裝套件…
  call npm install
  if errorlevel 1 ( pause & exit /b 1 )
)

rem 伺服器在背景啟動，等它可以連線後用 Chrome 的「應用程式視窗」打開（沒有網址列）
start "Lyra server" /min cmd /c "npm run dev"
powershell -NoProfile -Command "for($i=0;$i -lt 60;$i++){try{(Invoke-WebRequest -UseBasicParsing http://127.0.0.1:5180/ -TimeoutSec 1)|Out-Null;exit 0}catch{Start-Sleep -Milliseconds 500}};exit 1"
set "CHROME="
if exist "%ProgramFiles%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if exist "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%LocalAppData%\Google\Chrome\Application\chrome.exe" set "CHROME=%LocalAppData%\Google\Chrome\Application\chrome.exe"
if defined CHROME (
  start "" "%CHROME%" --app=http://127.0.0.1:5180
) else (
  echo 沒有找到 Chrome，改用預設瀏覽器打開。播放與翻譯功能建議使用 Chrome。
  start "" http://127.0.0.1:5180
)
