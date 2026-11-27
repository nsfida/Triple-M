@echo off
del "%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup\FinesOutlookHelper.vbs" 2>nul
taskkill /F /FI "WINDOWTITLE eq *" /IM powershell.exe /FI "COMMANDLINE eq *OutlookHelper*" >nul 2>nul
rmdir /S /Q "%LOCALAPPDATA%\FinesAutomation" 2>nul
echo Removed. Sign out/in (or restart) to stop the helper completely.
pause
