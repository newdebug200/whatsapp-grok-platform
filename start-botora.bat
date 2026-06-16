@echo off
setlocal enabledelayedexpansion

:: ─────────────────────────────────────────────
:: AUTO-LOGGING : affiche ET sauvegarde dans botora-debug.log
:: ─────────────────────────────────────────────
if "%BOTORA_LOGGING%"=="" (
    set "BOTORA_LOGGING=1"
    echo  Log en cours... Les resultats seront dans :
    echo  %~dp0botora-debug.log
    echo.
    call "%~f0" %* 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%~dp0botora-debug.log'"
    exit /b
)

cd /d "%~dp0"

title Botora — Demarrage
echo.
echo === %DATE% %TIME% ===
echo.
echo  ============================================
echo     BOTORA — Plateforme WhatsApp AI
echo  ============================================
echo.

:: ─────────────────────────────────────────────
:: 1. Verifier Node.js
:: ─────────────────────────────────────────────
echo  [1] Verification Node.js...
node --version
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js introuvable. https://nodejs.org
    pause
    exit /b 1
)
echo  [OK] Node.js detecte
echo.

:: ─────────────────────────────────────────────
:: 2. Verifier le fichier .env backend
:: ─────────────────────────────────────────────
echo  [2] Verification .env...
if not exist "backend\.env" (
    if exist "backend\.env.example" (
        echo  [CONFIG] .env manquant — copie depuis .env.example...
        copy "backend\.env.example" "backend\.env"
        echo  [ATTENTION] Ouvrez backend\.env et ajoutez GROK_API_KEY puis relancez.
        pause
        exit /b 0
    ) else (
        echo  [ERREUR] backend\.env introuvable et pas de .env.example
        pause
        exit /b 1
    )
) else (
    echo  [OK] backend\.env present
    echo.
)

:: ─────────────────────────────────────────────
:: 3. Installer dependances backend
:: ─────────────────────────────────────────────
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

echo  [3] Dependances backend...
if not exist "backend\node_modules" (
    echo  [INSTALL] Installation en cours...
    cd backend
    call npm install --no-audit --no-fund
    echo  [EXIT npm install backend] %errorlevel%
    if %errorlevel% neq 0 (
        cd ..
        echo  [ERREUR] npm install backend a echoue
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Backend installe
) else (
    echo  [OK] node_modules backend present
)
echo.

:: ─────────────────────────────────────────────
:: 4. Base de donnees (node:sqlite natif — jamais bloquant)
:: ─────────────────────────────────────────────
echo  [4] Synchronisation base de donnees...
echo  [CMD] node backend/setup-db.js
cd backend
call node setup-db.js
echo  [EXIT setup-db.js] %errorlevel%
if %errorlevel% neq 0 (
    echo  [ERREUR] setup-db.js a echoue
    cd ..
    pause
    exit /b 1
)
cd ..
echo  [OK] Base de donnees synchronisee
echo.

:: ─────────────────────────────────────────────
:: 5. Installer dependances frontend
:: ─────────────────────────────────────────────
echo  [5] Dependances frontend...
if not exist "frontend\node_modules" (
    echo  [INSTALL] Installation en cours...
    cd frontend
    call npm install --no-audit --no-fund
    echo  [EXIT npm install frontend] %errorlevel%
    if %errorlevel% neq 0 (
        cd ..
        echo  [ERREUR] npm install frontend a echoue
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Frontend installe
) else (
    echo  [OK] node_modules frontend present
)
echo.

:: ─────────────────────────────────────────────
:: 6. Demarrer backend
:: ─────────────────────────────────────────────
echo  [6] Demarrage backend sur http://localhost:3001
start "Botora Backend" cmd /k "title Botora Backend && cd /d "%~dp0backend" && set PUPPETEER_SKIP_DOWNLOAD=true && set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && npm run dev"
timeout /t 3 /nobreak >nul

:: ─────────────────────────────────────────────
:: 7. Demarrer frontend
:: ─────────────────────────────────────────────
echo  [7] Demarrage frontend sur http://localhost:5173
start "Botora Frontend" cmd /k "title Botora Frontend && cd /d "%~dp0frontend" && npm run dev"
timeout /t 5 /nobreak >nul

:: ─────────────────────────────────────────────
:: 8. Ouvrir navigateur
:: ─────────────────────────────────────────────
echo  [8] Ouverture navigateur...
start "" http://localhost:5173

:: ─────────────────────────────────────────────
:: 9. Fin
:: ─────────────────────────────────────────────
echo.
echo  ============================================
echo   Botora est lance !
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo   LOG      : %~dp0botora-debug.log
echo  ============================================
echo.
echo === FIN %TIME% ===
