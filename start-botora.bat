@echo off
setlocal enabledelayedexpansion
cd /d "%~dp0"

title Botora — Demarrage
echo.
echo  ============================================
echo     BOTORA — Plateforme WhatsApp AI
echo  ============================================
echo.

:: ─────────────────────────────────────────────
:: 1. Verifier Node.js
:: ─────────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js n'est pas installe sur ce PC.
    echo.
    echo  Telechargez-le ici : https://nodejs.org
    echo  Installez-le puis relancez ce fichier.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%i in ('node --version') do set NODE_VER=%%i
echo  [OK] Node.js %NODE_VER% detecte
echo.

:: ─────────────────────────────────────────────
:: 2. Verifier le fichier .env backend
:: ─────────────────────────────────────────────
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo  [CONFIG] Fichier .env manquant — creation depuis .env.example...
        copy "backend\.env.example" "backend\.env" >nul
        echo.
        echo  =====================================================
        echo   ACTION REQUISE : Ouvrez backend\.env et renseignez
        echo     - GROK_API_KEY  : votre cle API Groq
        echo     - JWT_SECRET    : une chaine secrete de votre choix
        echo  =====================================================
        echo.
        echo  Le fichier va s'ouvrir dans le Bloc-notes.
        echo  Enregistrez-le puis appuyez sur une touche ici.
        echo.
        start /wait notepad "backend\.env"
        echo  Fichier .env configure. On continue...
        echo.
    ) else (
        echo  [ERREUR] Fichier backend\.env introuvable et pas de .env.example.
        echo  Creez manuellement backend\.env avec les variables requises.
        pause
        exit /b 1
    )
) else (
    echo  [OK] Fichier .env detecte
    echo.
)

:: ─────────────────────────────────────────────
:: 3. Installer les dependances backend
::    — On desactive le telechargement Chromium de Puppeteer
::      (whatsapp-web.js utilise Chrome deja installe sur le PC)
:: ─────────────────────────────────────────────
echo  [INSTALL] Mise a jour des dependances backend...
echo  (premiere fois : peut prendre 1-3 minutes, soyez patient)
echo.

set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

cd backend
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] npm install backend a echoue.
    echo  Verifiez votre connexion internet et relancez.
    cd ..
    pause
    exit /b 1
)
echo.
echo  [OK] Dependances backend installees
echo.

:: ─────────────────────────────────────────────
:: 4. Synchronisation base de donnees (script Node.js natif)
::    — Cree les tables SQLite directement, sans Prisma CLI
::    — Fonctionne 100% hors-ligne, pas de telechargement
:: ─────────────────────────────────────────────
echo  [DB] Synchronisation de la base de donnees...
call node setup-db.js
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] Impossible de synchroniser la base de donnees.
    echo  Verifiez votre fichier backend\.env (DATABASE_URL).
    cd ..
    pause
    exit /b 1
)

cd ..
echo.

:: ─────────────────────────────────────────────
:: 5. Installer les dependances frontend
:: ─────────────────────────────────────────────
echo  [INSTALL] Mise a jour des dependances frontend...
cd frontend
call npm install --no-audit --no-fund
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] npm install frontend a echoue.
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Dependances frontend installees
echo.

:: ─────────────────────────────────────────────
:: 6. Demarrer le backend (via _run.bat helper)
:: ─────────────────────────────────────────────
echo  [START] Demarrage du backend...
start "Botora Backend" "%~dp0backend\_run.bat"

timeout /t 4 /nobreak >nul

:: ─────────────────────────────────────────────
:: 7. Demarrer le frontend (via _run.bat helper)
:: ─────────────────────────────────────────────
echo  [START] Demarrage du frontend...
start "Botora Frontend" "%~dp0frontend\_run.bat"

:: ─────────────────────────────────────────────
:: 8. Ouvrir le navigateur apres 5 secondes
:: ─────────────────────────────────────────────
timeout /t 5 /nobreak >nul
start "" http://localhost:5173

echo.
echo  ============================================
echo   Botora est lance !
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo   Fermez les deux fenetres pour arreter.
echo  ============================================
echo.
pause
