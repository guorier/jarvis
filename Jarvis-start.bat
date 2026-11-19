@echo off
rem J.A.R.V.I.S. launcher - double-click to start
cd /d "%~dp0"
if not exist "node_modules\electron\dist\electron.exe" (
  echo First run: installing packages...
  call npm install
  call node node_modules\electron\install.js
)
start "" "node_modules\electron\dist\electron.exe" .
