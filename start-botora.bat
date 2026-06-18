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
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║          BOTORA — Plateforme WhatsApp IA                ║
echo  ║          Demarrage automatique Windows                  ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

:: ─────────────────────────────────────────────
:: 1. Verifier Node.js et npm
:: ─────────────────────────────────────────────
echo  [1/7] Verification Node.js et npm...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js introuvable. Installez-le depuis https://nodejs.org
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do echo  [OK] Node.js %%v detecte.
npm --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] npm introuvable.
    pause
    exit /b 1
)
echo  [OK] npm detecte.
echo.

:: ─────────────────────────────────────────────
:: 2. Tuer les processus Node existants (libere les fichiers verrouilles)
:: ─────────────────────────────────────────────
echo  [2/7] Arret des processus Node existants...
taskkill /F /IM node.exe /T >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Processus Node arretes — attente liberation fichiers...
    timeout /t 3 /nobreak >nul
) else (
    echo  [OK] Aucun processus Node en cours.
)
echo.

:: ─────────────────────────────────────────────
:: 3. Verifier le fichier .env backend
:: ─────────────────────────────────────────────
echo  [3/7] Verification .env backend...
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
)
echo.

:: ─────────────────────────────────────────────
:: 4. Installer dependances backend + Prisma client
:: ─────────────────────────────────────────────
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

echo  [4/7] Dependances backend...
if not exist "backend\node_modules" (
    echo  [INSTALL] Installation en cours — peut prendre quelques minutes...
    cd backend
    call npm install --no-audit --no-fund --ignore-scripts
    echo  [EXIT npm install backend] %errorlevel%
    if %errorlevel% neq 0 (
        cd ..
        echo  [ERREUR] npm install backend a echoue. Verifiez votre connexion.
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Dependances backend installees.
) else (
    echo  [OK] node_modules backend present.
)

:: Toujours regenerer le client Prisma (evite les erreurs apres mise a jour)
echo  [4b] Generation du client Prisma...
cd backend
call npx prisma generate --no-hints >nul 2>&1
echo  [EXIT prisma generate] %errorlevel%
if %errorlevel% neq 0 (
    echo  [ATTENTION] prisma generate a echoue — le backend pourrait ne pas demarrer.
) else (
    echo  [OK] Client Prisma genere.
)
cd ..
echo.

:: ─────────────────────────────────────────────
:: 5. Base de donnees
:: ─────────────────────────────────────────────
echo  [5/7] Synchronisation base de donnees...
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
echo  [OK] Base de donnees synchronisee.
echo.

:: ─────────────────────────────────────────────
:: 6. Installer dependances frontend
:: ─────────────────────────────────────────────
echo  [6/7] Dependances frontend...
if not exist "frontend\node_modules" (
    echo  [INSTALL] Installation en cours...
    cd frontend
    call npm install --no-audit --no-fund
    echo  [EXIT npm install frontend] %errorlevel%
    if %errorlevel% neq 0 (
        cd ..
        echo  [ERREUR] npm install frontend a echoue.
        pause
        exit /b 1
    )
    cd ..
    echo  [OK] Frontend installe.
) else (
    echo  [OK] node_modules frontend present.
)
echo.

:: ─────────────────────────────────────────────
:: 7. Lancer backend + frontend + navigateur
:: ─────────────────────────────────────────────
echo  [7/7] Demarrage des serveurs...

start "Botora Backend" cmd /k "title Botora Backend && cd /d "%~dp0backend" && set PUPPETEER_SKIP_DOWNLOAD=true && set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && npm run dev"
timeout /t 3 /nobreak >nul

start "Botora Frontend" cmd /k "title Botora Frontend && cd /d "%~dp0frontend" && npm run dev"
timeout /t 5 /nobreak >nul

echo  [OK] Ouverture du navigateur...
start "" http://localhost:5173

echo.
echo  ============================================
echo   Botora est lance !
echo   Frontend : http://localhost:5173
echo   Backend  : http://localhost:3001
echo   LOG      : %~dp0botora-debug.log
echo  ============================================
echo.
echo === FIN %TIME% ===
