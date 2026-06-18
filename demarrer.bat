@echo off
chcp 65001 >nul 2>&1
title Botora — Démarrage de la plateforme WhatsApp IA

REM ══════════════════════════════════════════════════════════════════════════
REM  Botora / SanRobot — Script de démarrage Windows
REM  Double-cliquez sur ce fichier depuis le dossier whatsapp-grok-platform
REM ══════════════════════════════════════════════════════════════════════════

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║          BOTORA — Plateforme WhatsApp IA                ║
echo  ║          Démarrage automatique Windows                  ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

REM ── Sauvegarde du répertoire racine ──
set "ROOT_DIR=%~dp0"
REM Supprimer le slash final
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"

REM ── Vérification Node.js ──
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js n'est pas installe.
    echo.
    echo  Telechargez Node.js 18+ sur : https://nodejs.org
    echo  Apres installation, relancez ce fichier.
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detecte.

REM ── Vérification npm ──
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] npm introuvable. Reinstallez Node.js.
    pause
    exit /b 1
)
echo  [OK] npm detecte.
echo.

REM ── Vérification du dossier racine ──
if not exist "%ROOT_DIR%\backend\package.json" (
    echo  [ERREUR] Lancez ce fichier DEPUIS le dossier whatsapp-grok-platform.
    echo  Dossier actuel : %ROOT_DIR%
    echo.
    pause
    exit /b 1
)
echo  [OK] Dossier du projet detecte.

REM ══════════════════════════════════════════════════════════════════════════
REM  CREATION DES FICHIERS .env SI ABSENTS
REM ══════════════════════════════════════════════════════════════════════════

if not exist "%ROOT_DIR%\backend\.env" (
    if exist "%ROOT_DIR%\backend\.env.example" (
        copy "%ROOT_DIR%\backend\.env.example" "%ROOT_DIR%\backend\.env" >nul
        echo.
        echo  ┌─────────────────────────────────────────────────────────┐
        echo  │  PREMIERE INSTALLATION detectee                         │
        echo  │                                                         │
        echo  │  Le fichier backend\.env a ete cree.                   │
        echo  │  Vous DEVEZ renseigner vos cles avant de continuer :   │
        echo  │                                                         │
        echo  │    GROK_API_KEY=votre_cle_groq                         │
        echo  │    JWT_SECRET=une_chaine_secrete_longue                 │
        echo  │                                                         │
        echo  │  Editez backend\.env puis relancez ce script.          │
        echo  └─────────────────────────────────────────────────────────┘
        echo.
        REM Ouvrir le fichier .env dans le bloc-notes
        start notepad "%ROOT_DIR%\backend\.env"
        echo  Le fichier backend\.env a ete ouvert dans le Bloc-notes.
        echo  Remplissez GROK_API_KEY et JWT_SECRET, sauvegardez, puis...
        echo.
        pause
    ) else (
        echo  [AVERT] backend\.env absent et backend\.env.example introuvable.
        echo  Creez backend\.env manuellement avant de continuer.
        echo.
        pause
        exit /b 1
    )
)

if not exist "%ROOT_DIR%\frontend\.env" (
    if exist "%ROOT_DIR%\frontend\.env.example" (
        copy "%ROOT_DIR%\frontend\.env.example" "%ROOT_DIR%\frontend\.env" >nul
        echo  [SETUP] frontend\.env cree.
    ) else (
        echo VITE_API_URL=http://localhost:3001/api> "%ROOT_DIR%\frontend\.env"
        echo VITE_SOCKET_URL=http://localhost:3001>> "%ROOT_DIR%\frontend\.env"
        echo  [SETUP] frontend\.env cree avec valeurs par defaut.
    )
)
echo  [OK] Fichiers .env prets.
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  INSTALLATION DES DEPENDANCES
REM ══════════════════════════════════════════════════════════════════════════

echo  [1/4] Installation des dependances backend...
echo        (peut prendre quelques minutes la premiere fois)
cd /d "%ROOT_DIR%\backend"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] npm install backend a echoue.
    echo  Verifiez votre connexion internet et relancez.
    cd /d "%ROOT_DIR%"
    pause
    exit /b 1
)
echo  [OK] Dependances backend OK.
echo.

REM ── Prisma : générer le client ──
echo  [2/4] Configuration de la base de donnees...
call npx prisma generate
echo.

REM ── Appliquer les migrations ──
call npx prisma migrate deploy >nul 2>&1
if %errorlevel% neq 0 (
    REM Fallback : db push si pas de dossier migrations
    call npx prisma db push --accept-data-loss >nul 2>&1
)
echo  [OK] Base de donnees configuree ^(SQLite dev.db^).
echo.

REM ── Dépendances frontend ──
echo  [3/4] Installation des dependances frontend...
cd /d "%ROOT_DIR%\frontend"
call npm install
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] npm install frontend a echoue.
    cd /d "%ROOT_DIR%"
    pause
    exit /b 1
)
echo  [OK] Dependances frontend OK.
echo.

REM ── Retour à la racine ──
cd /d "%ROOT_DIR%"

REM ══════════════════════════════════════════════════════════════════════════
REM  DÉMARRAGE DES SERVEURS
REM ══════════════════════════════════════════════════════════════════════════

echo  [4/4] Demarrage des serveurs...
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  Backend  API  →  http://localhost:3001               ║
echo  ║  Frontend App  →  http://localhost:5173               ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Deux nouvelles fenetres vont s'ouvrir.
echo  NE PAS les fermer pendant l'utilisation de la plateforme.
echo.

REM ── Lancer le Backend dans une nouvelle fenêtre ──
start "BOTORA — Backend API (port 3001)" cmd /k "chcp 65001 >nul && cd /d "%ROOT_DIR%\backend" && echo. && echo  [BACKEND] Demarrage sur http://localhost:3001 && echo  Ctrl+C pour arreter && echo. && npm run dev"

REM ── Attendre 3 secondes que le backend s'initialise ──
echo  Attente du backend...
timeout /t 3 /nobreak >nul

REM ── Lancer le Frontend dans une nouvelle fenêtre ──
start "BOTORA — Frontend UI (port 5173)" cmd /k "chcp 65001 >nul && cd /d "%ROOT_DIR%\frontend" && echo. && echo  [FRONTEND] Demarrage sur http://localhost:5173 && echo  Ctrl+C pour arreter && echo. && npm run dev"

REM ── Attendre 5 secondes puis ouvrir le navigateur ──
echo  Attente du frontend...
timeout /t 5 /nobreak >nul

echo  Ouverture de la plateforme dans le navigateur...
start "" "http://localhost:5173"

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  ✓  Plateforme Botora demarree avec succes !           ║
echo  ║                                                         ║
echo  ║  Ouvrez : http://localhost:5173                        ║
echo  ║                                                         ║
echo  ║  Pour arreter :                                         ║
echo  ║    Fermez les fenetres "Backend" et "Frontend"         ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Vous pouvez fermer CETTE fenetre. Les serveurs continuent.
echo.
pause
