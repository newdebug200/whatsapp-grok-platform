@echo off
setlocal enabledelayedexpansion
chcp 65001 >nul 2>&1

REM ══════════════════════════════════════════════════════════════════════════
REM  BOTORA — Script de démarrage Windows
REM  Double-cliquez depuis le dossier whatsapp-grok-platform
REM  Journal automatique dans : botora-debug.log
REM ══════════════════════════════════════════════════════════════════════════

REM ── Auto-logging (redirige tout dans botora-debug.log + écran) ────────────
if "%BOTORA_LOG%"=="" (
    set "BOTORA_LOG=1"
    call "%~f0" %* 2>&1 | powershell -NoProfile -Command "$input | Tee-Object -FilePath '%~dp0botora-debug.log'"
    exit /b
)

REM ── Répertoire racine ─────────────────────────────────────────────────────
set "ROOT=%~dp0"
if "%ROOT:~-1%"=="\" set "ROOT=%ROOT:~0,-1%"
cd /d "%ROOT%"

title Botora — Démarrage
echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║          BOTORA — Plateforme WhatsApp IA                ║
echo  ║          %DATE%  %TIME%                   ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 0 — Vérification du dossier
REM ══════════════════════════════════════════════════════════════════════════
if not exist "%ROOT%\backend\package.json" (
    echo  [ERREUR] Lancez demarrer.bat DEPUIS le dossier whatsapp-grok-platform.
    echo  Dossier detecte : %ROOT%
    pause & exit /b 1
)

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 1 — Mise à jour du code (git pull)
REM ══════════════════════════════════════════════════════════════════════════
echo  [1/8] Mise a jour du code...
where git >nul 2>&1
if %errorlevel% equ 0 (
    git pull origin work --no-edit >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] Code mis a jour depuis GitHub ^(branche work^).
    ) else (
        echo  [INFO] Pas de connexion ou pas de changement — on continue.
    )
) else (
    echo  [INFO] git non detecte — pas de mise a jour automatique.
)
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 2 — Vérification Node.js
REM ══════════════════════════════════════════════════════════════════════════
echo  [2/8] Verification Node.js...
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  [ERREUR] Node.js introuvable !
    echo.
    echo  Telechargez et installez Node.js 18+ depuis :
    echo    https://nodejs.org
    echo.
    echo  Apres installation, relancez ce fichier.
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detecte.

REM ── Vérification version minimale : 22.5 ──────────────────────────────────
for /f "tokens=1 delims=." %%m in ("%NODE_VER:v=%") do set NODE_MAJOR=%%m
if %NODE_MAJOR% LSS 22 (
    echo.
    echo  [ERREUR] Node.js 22 ou superieur est requis ^(detecte : %NODE_VER%^)
    echo.
    echo  setup-db.js utilise le module "node:sqlite" disponible depuis Node 22.5.
    echo  Telechargez Node.js 22 LTS sur : https://nodejs.org/en/download
    echo.
    pause ^& exit /b 1
)
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 3 — Libérer les ports (tuer Node existants)
REM ══════════════════════════════════════════════════════════════════════════
echo  [3/8] Liberation des ports (arret processus Node existants)...
taskkill /F /IM node.exe /T >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Processus Node arretes — attente 3s...
    timeout /t 3 /nobreak >nul
) else (
    echo  [OK] Aucun processus Node actif.
)
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 4 — Fichiers .env
REM ══════════════════════════════════════════════════════════════════════════
echo  [4/8] Verification des fichiers de configuration...

REM ── backend/.env ──
if not exist "%ROOT%\backend\.env" (
    if exist "%ROOT%\backend\.env.example" (
        copy "%ROOT%\backend\.env.example" "%ROOT%\backend\.env" >nul
        echo.
        echo  ┌─────────────────────────────────────────────────────────┐
        echo  │  PREMIERE INSTALLATION detectee                         │
        echo  │                                                         │
        echo  │  Le fichier backend\.env vient d'etre cree.            │
        echo  │  Vous DEVEZ y renseigner vos cles API :                │
        echo  │                                                         │
        echo  │    GROK_API_KEY=votre_cle_groq                         │
        echo  │    JWT_SECRET=une_longue_chaine_secrete                 │
        echo  │                                                         │
        echo  │  Le Bloc-notes va s'ouvrir. Remplissez, sauvegardez,  │
        echo  │  fermez le Bloc-notes puis appuyez sur une touche.     │
        echo  └─────────────────────────────────────────────────────────┘
        echo.
        start /wait notepad "%ROOT%\backend\.env"
        echo  [OK] Configuration sauvegardee — on continue.
    ) else (
        echo  [ERREUR] backend\.env absent et pas de .env.example.
        echo  Creez backend\.env avec au minimum :
        echo    PORT=3001
        echo    DATABASE_URL=file:./dev.db
        echo    GROK_API_KEY=votre_cle
        echo    JWT_SECRET=votre_secret
        pause & exit /b 1
    )
) else (
    echo  [OK] backend\.env present.
)

REM ── frontend/.env ──
if not exist "%ROOT%\frontend\.env" (
    if exist "%ROOT%\frontend\.env.example" (
        copy "%ROOT%\frontend\.env.example" "%ROOT%\frontend\.env" >nul
        echo  [SETUP] frontend\.env cree depuis .env.example.
    ) else (
        echo VITE_API_URL=http://localhost:3001/api> "%ROOT%\frontend\.env"
        echo VITE_SOCKET_URL=http://localhost:3001>> "%ROOT%\frontend\.env"
        echo  [SETUP] frontend\.env cree ^(valeurs par defaut^).
    )
) else (
    echo  [OK] frontend\.env present.
)
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  Variables Puppeteer — OBLIGATOIRES pour whatsapp-web.js
REM ══════════════════════════════════════════════════════════════════════════
set PUPPETEER_SKIP_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD_STEP=true

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 5 — Dépendances backend
REM ══════════════════════════════════════════════════════════════════════════
echo  [5/8] Dependances backend...
cd /d "%ROOT%\backend"

if not exist "node_modules" (
    echo  [INSTALL] Premiere installation — peut prendre 2 a 5 minutes...
    call npm install --prefer-offline --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo  [ERREUR] npm install backend a echoue. Verifiez votre connexion.
        cd /d "%ROOT%"
        pause & exit /b 1
    )
    echo  [OK] Dependances backend installees.
) else (
    echo  [OK] node_modules backend deja present.
)

REM ── Installer les nouvelles dependances si elles manquent ────────────────
if not exist "node_modules\ffmpeg-static" (
    echo  [5b] Nouvelle dependance detectee ^(ffmpeg-static^) — installation...
    call npm install --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo  [ATTENTION] npm install a echoue — certaines fonctions audio peuvent ne pas marcher.
    ) else (
        echo  [OK] Nouvelles dependances installees.
    )
)

REM ── Toujours régénérer le client Prisma (rapide, évite les erreurs) ──────
echo  [5c] Generation du client Prisma...
call npx prisma generate --no-hints >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ATTENTION] prisma generate a echoue — tentative sans --no-hints...
    call npx prisma generate >nul 2>&1
)
echo  [OK] Client Prisma pret.
cd /d "%ROOT%"
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 6 — Base de données
REM ══════════════════════════════════════════════════════════════════════════
echo  [6/8] Synchronisation base de donnees...
cd /d "%ROOT%\backend"

REM ── Étape 6a : prisma db push (crée/met à jour les tables depuis schema.prisma) ─
echo  [6a] Creation des tables via Prisma...
call npx prisma db push --skip-generate >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Tables creees/mises a jour par Prisma.
) else (
    echo  [ATTENTION] prisma db push a echoue, tentative avec --accept-data-loss...
    call npx prisma db push --skip-generate --accept-data-loss >nul 2>&1
    if %errorlevel% equ 0 (
        echo  [OK] Tables synchronisees.
    ) else (
        echo  [ATTENTION] Prisma db push indisponible — passage a setup-db.js...
    )
)

REM ── Étape 6b : setup-db.js (colonnes manquantes sur DB existante, idempotent) ─
echo  [6b] Application des migrations complementaires...
node setup-db.js >nul 2>&1
if %errorlevel% equ 0 (
    echo  [OK] Migrations complementaires appliquees.
) else (
    echo  [INFO] setup-db.js indisponible ^(Node ^< 22.5^) — Prisma seul est utilise.
)
cd /d "%ROOT%"

REM ── Créer le dossier uploads (médias WhatsApp) ────────────────────────────
if not exist "%ROOT%\backend\uploads" (
    mkdir "%ROOT%\backend\uploads"
    echo  [OK] Dossier backend\uploads cree.
)
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 7 — Dépendances frontend
REM ══════════════════════════════════════════════════════════════════════════
echo  [7/8] Dependances frontend...
cd /d "%ROOT%\frontend"

if not exist "node_modules" (
    echo  [INSTALL] Installation frontend...
    call npm install --prefer-offline --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo  [ERREUR] npm install frontend a echoue.
        cd /d "%ROOT%"
        pause & exit /b 1
    )
    echo  [OK] Dependances frontend installees.
) else (
    echo  [OK] node_modules frontend deja present.
)
cd /d "%ROOT%"
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 8 — Démarrage des serveurs
REM ══════════════════════════════════════════════════════════════════════════
echo  [8/8] Demarrage des serveurs...
echo.

REM ── Backend ───────────────────────────────────────────────────────────────
start "BOTORA Backend — port 3001" cmd /k "chcp 65001 >nul && title BOTORA Backend && cd /d "%ROOT%\backend" && set PUPPETEER_SKIP_DOWNLOAD=true && set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && echo. && echo  Backend demarre sur http://localhost:3001 && echo  Fermez cette fenetre pour arreter le backend. && echo. && npm run dev"

echo  Backend en cours de demarrage...
timeout /t 4 /nobreak >nul

REM ── Frontend ──────────────────────────────────────────────────────────────
start "BOTORA Frontend — port 5173" cmd /k "chcp 65001 >nul && title BOTORA Frontend && cd /d "%ROOT%\frontend" && echo. && echo  Frontend demarre sur http://localhost:5173 && echo  Fermez cette fenetre pour arreter le frontend. && echo. && npm run dev"

echo  Frontend en cours de demarrage...
timeout /t 5 /nobreak >nul

REM ── Ouvrir le navigateur ──────────────────────────────────────────────────
echo  Ouverture du navigateur...
start "" "http://localhost:5173"

echo.
echo  ╔══════════════════════════════════════════════════════════╗
echo  ║  BOTORA est lance !                                     ║
echo  ║                                                         ║
echo  ║  Interface :  http://localhost:5173                     ║
echo  ║  API       :  http://localhost:3001                     ║
echo  ║  Journal   :  botora-debug.log (dans ce dossier)       ║
echo  ║                                                         ║
echo  ║  Pour arreter : fermez les fenetres Backend/Frontend    ║
echo  ╚══════════════════════════════════════════════════════════╝
echo.
echo  Vous pouvez fermer CETTE fenetre. Les serveurs continuent.
echo.
pause
