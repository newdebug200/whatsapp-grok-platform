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
:: 4. Migration base de donnees Prisma
::    — On pre-resout toutes les migrations connues comme bloquees
::    — Puis on applique les migrations manquantes
:: ─────────────────────────────────────────────
echo  [DB] Synchronisation de la base de donnees...

:: Pre-resoudre toutes les migrations potentiellement bloquees
:: (silencieux — ces commandes echouent sans consequence si deja ok)
call npx prisma migrate resolve --rolled-back 20260615000000_add_business_hours_sensitive_quickreply >nul 2>&1
call npx prisma migrate resolve --rolled-back 20260615120000_add_credits_platform_config >nul 2>&1

:: Appliquer les migrations (sortie supprimee pour eviter les messages rouges Prisma)
echo  [DB] Application des migrations...
call npx prisma migrate deploy >nul 2>&1
if %errorlevel% neq 0 (
    echo  [DB] Fallback : synchronisation directe du schema...
    call npx prisma db push --accept-data-loss >nul 2>&1
    if %errorlevel% neq 0 (
        echo.
        echo  [ERREUR] Impossible de synchroniser la base de donnees.
        echo  Verifiez votre fichier backend\.env (DATABASE_URL).
        cd ..
        pause
        exit /b 1
    )
    echo  [OK] Base de donnees synchronisee via db push
) else (
    echo  [OK] Migrations appliquees avec succes
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
:: 6. Demarrer le backend dans une nouvelle fenetre
:: ─────────────────────────────────────────────
echo  [START] Demarrage du backend sur http://localhost:3001
start "Botora — Backend" cmd /k "title Botora Backend && cd /d "%~dp0backend" && set PUPPETEER_SKIP_DOWNLOAD=true && set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && npm run dev"

:: Attendre que le backend demarre
timeout /t 3 /nobreak >nul

:: ─────────────────────────────────────────────
:: 7. Demarrer le frontend dans une nouvelle fenetre
:: ─────────────────────────────────────────────
echo  [START] Demarrage du frontend sur http://localhost:5173
start "Botora — Frontend" cmd /k "title Botora Frontend && cd /d "%~dp0frontend" && npm run dev"

:: ─────────────────────────────────────────────
:: 8. Ouvrir le navigateur apres 4 secondes
:: ─────────────────────────────────────────────
timeout /t 4 /nobreak >nul
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
timeout /t 6 /nobreak >nul
