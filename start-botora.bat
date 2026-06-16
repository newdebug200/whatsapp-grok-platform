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
:: ─────────────────────────────────────────────
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

if not exist "backend\node_modules" (
    echo  [INSTALL] Premiere installation — dependances backend...
    echo  (Cela peut prendre quelques minutes)
    echo.
    cd backend
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo.
        echo  [ERREUR] npm install backend a echoue.
        cd ..
        pause
        exit /b 1
    )
    cd ..
    echo.
    echo  [OK] Dependances backend installees
    echo.
) else (
    echo  [OK] Dependances backend presentes
    echo.
)

:: ─────────────────────────────────────────────
:: 4. Synchronisation base de donnees
::    — Script Node.js natif (node:sqlite), sans Prisma CLI
::    — Rapide, hors-ligne, jamais bloquant
:: ─────────────────────────────────────────────
echo  [DB] Synchronisation de la base de donnees...
cd backend
call node setup-db.js
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] Echec synchronisation DB.
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
if not exist "frontend\node_modules" (
    echo  [INSTALL] Premiere installation — dependances frontend...
    echo  (Cela peut prendre quelques minutes)
    echo.
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
    echo.
    echo  [OK] Dependances frontend installees
    echo.
) else (
    echo  [OK] Dependances frontend presentes
    echo.
)

:: ─────────────────────────────────────────────
:: 6. Demarrer le backend dans une nouvelle fenetre
:: ─────────────────────────────────────────────
echo  [START] Demarrage du backend sur http://localhost:3001
start "Botora Backend" cmd /k "title Botora Backend && cd /d "%~dp0backend" && set PUPPETEER_SKIP_DOWNLOAD=true && set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && npm run dev"

:: Attendre que le backend demarre avant le frontend
timeout /t 3 /nobreak >nul

:: ─────────────────────────────────────────────
:: 7. Demarrer le frontend dans une nouvelle fenetre
:: ─────────────────────────────────────────────
echo  [START] Demarrage du frontend sur http://localhost:5173
start "Botora Frontend" cmd /k "title Botora Frontend && cd /d "%~dp0frontend" && npm run dev"

:: ─────────────────────────────────────────────
:: 8. Ouvrir le navigateur apres 5 secondes
:: ─────────────────────────────────────────────
timeout /t 5 /nobreak >nul
start "" http://localhost:5173

:: ─────────────────────────────────────────────
:: 9. Message final
:: ─────────────────────────────────────────────
echo.
echo  ============================================
echo   Botora est lance !
echo.
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo.
echo   Deux fenetres sont ouvertes.
echo   Fermez-les pour arreter les serveurs.
echo  ============================================
echo.
pause
