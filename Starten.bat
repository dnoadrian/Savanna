@echo off
title SAVANNA ROYALE
cd /d "%~dp0"
echo.
echo   =============================
echo          SAVANNA ROYALE
echo   =============================
echo.

where npm >nul 2>nul
if errorlevel 1 goto nonode

if exist "node_modules\ws\package.json" goto run
echo Erster Start: Spieldateien werden eingerichtet, bitte warten ...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto failed

:run
echo.
echo Das Spiel oeffnet sich gleich im Browser: http://localhost:4242
echo Der Online-Link fuer deine Freunde erscheint gleich hier im Fenster.
echo WICHTIG: Dieses Fenster offen lassen, solange ihr spielt!
echo Zum Beenden einfach dieses Fenster schliessen.
echo.
call npm run spielen
echo.
pause
exit /b 0

:nonode
echo Node.js ist noch nicht installiert.
echo Bitte die LTS-Version von https://nodejs.org installieren
echo und danach diese Datei erneut doppelklicken.
start "" "https://nodejs.org"
echo.
pause
exit /b 1

:failed
echo.
echo Die Einrichtung hat nicht geklappt. Ist das Internet verbunden?
echo Bitte diese Datei noch einmal doppelklicken.
echo.
pause
exit /b 1
