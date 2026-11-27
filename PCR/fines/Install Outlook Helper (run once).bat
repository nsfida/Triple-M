@echo off
title Install Outlook helper
set "D=%LOCALAPPDATA%\FinesAutomation"
set "S=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
mkdir "%D%" 2>nul
copy /Y "%~dp0OutlookHelper.ps1" "%D%\OutlookHelper.ps1" >nul
(
echo Set s = CreateObject^("WScript.Shell"^)
echo p = s.ExpandEnvironmentStrings^("%%LOCALAPPDATA%%"^) ^& "\FinesAutomation\OutlookHelper.ps1"
echo s.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File """ ^& p ^& """", 0, False
) > "%D%\RunHelper.vbs"
copy /Y "%D%\RunHelper.vbs" "%S%\FinesOutlookHelper.vbs" >nul
wscript "%D%\RunHelper.vbs"
echo.
echo Done. The helper is running now and will start automatically with Windows.
echo You can now use the Send email button - it opens Outlook directly.
echo.
pause
