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
    set "BOTORA_LOG_FILE=%~dp0botora-debug.log"
    call "%~f0" %* 2>&1 | powershell -NoProfile -Command "$exitCode = 0; $input | ForEach-Object { if ($_ -match '^__BOTORA_EXIT_CODE=(\d+)$') { $exitCode = [int]$matches[1] } else { $_ | Tee-Object -FilePath $env:BOTORA_LOG_FILE -Append } }; exit $exitCode"
    exit /b !errorlevel!
)

call :main %*
set "BOTORA_EXIT_CODE=!errorlevel!"
echo __BOTORA_EXIT_CODE=!BOTORA_EXIT_CODE!
exit /b !BOTORA_EXIT_CODE!

:main
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
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] Node.js est requis pour lancer Botora.
    echo  Installez Node.js LTS depuis https://nodejs.org puis relancez ce fichier.
    pause & exit /b 1
)
where npm >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ERREUR] npm est introuvable. Reinstallez Node.js LTS puis relancez ce fichier.
    pause & exit /b 1
)
echo  [OK] Node.js et npm sont disponibles.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 1 — Préserver la branche et les modifications locales
REM ══════════════════════════════════════════════════════════════════════════
echo  [1/8] Mise a jour Git automatique desactivee.
echo  [INFO] Mettez le code a jour manuellement apres avoir verifie votre branche.
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
    echo  Telechargez et installez Node.js 22.5+ depuis :
    echo    https://nodejs.org
    echo.
    echo  Apres installation, relancez ce fichier.
    echo.
    pause & exit /b 1
)
for /f "tokens=*" %%v in ('node -v 2^>nul') do set NODE_VER=%%v
echo  [OK] Node.js %NODE_VER% detecte.

REM ── Vérification version minimale : 22.5 ──────────────────────────────────
node -e "const [major,minor]=process.versions.node.split('.').map(Number); process.exit(major > 22 || (major === 22 && minor >= 5) ? 0 : 1)"
if errorlevel 1 (
    echo.
    echo  [ERREUR] Node.js 22.5 ou superieur est requis ^(detecte : %NODE_VER%^)
    echo.
    echo  setup-db.js utilise le module "node:sqlite" disponible depuis Node 22.5.
    echo  Telechargez Node.js 22 LTS sur : https://nodejs.org/en/download
    echo.
    pause & exit /b 1
)
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 3 — Vérifier les ports sans arrêter de processus tiers
REM ══════════════════════════════════════════════════════════════════════════
echo  [3/8] Verification des ports 3001 et 5173...
powershell -NoProfile -Command "$ports = @(3001,5173); $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object { $ports -contains $_.LocalPort }; if ($listeners) { $listeners | ForEach-Object { Write-Output ('Port ' + $_.LocalPort + ' deja utilise par le PID ' + $_.OwningProcess) }; exit 1 }"
if errorlevel 1 (
    echo  [ERREUR] Un port requis est deja utilise. Aucun processus n'a ete arrete.
    echo  Fermez uniquement la fenetre Botora correspondante, puis relancez.
    pause & exit /b 1
)
echo  [OK] Les ports requis sont disponibles.
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

echo  [INSTALL] Verification et installation des dependances backend...
echo  Cette etape installe aussi toute nouvelle dependance manquante.
call npm install --prefer-offline --no-audit --no-fund
if %errorlevel% neq 0 (
    echo  [ERREUR] npm install backend a echoue. Verifiez votre connexion.
    cd /d "%ROOT%"
    pause & exit /b 1
)
echo  [OK] Dependances backend presentes.

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

REM ── Vérifier le SDK FedaPay ajouté pour les paiements et webhooks ─────────
if not exist "node_modules\fedapay" (
    echo  [5b] SDK FedaPay absent — installation automatique...
    call npm install fedapay --save --no-audit --no-fund
    if %errorlevel% neq 0 (
        echo  [ERREUR] Installation du SDK FedaPay impossible.
        echo  Verifiez votre connexion Internet puis relancez demarrer.bat.
        cd /d "%ROOT%"
        pause & exit /b 1
    ) else (
        echo  [OK] SDK FedaPay installe.
    )
) else (
    echo  [OK] SDK FedaPay deja present.
)

REM ── Toujours régénérer le client Prisma (rapide, évite les erreurs) ──────
echo  [5c] Generation du client Prisma...
call npx prisma generate --no-hints >nul 2>&1
if %errorlevel% neq 0 (
    echo  [ATTENTION] prisma generate a echoue — tentative sans --no-hints...
    call npx prisma generate >nul 2>&1
)
if %errorlevel% neq 0 (
    echo  [ERREUR] La generation du client Prisma a echoue. Consultez les erreurs ci-dessus.
    cd /d "%ROOT%"
    pause & exit /b 1
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
call npx prisma db push --skip-generate
if errorlevel 1 (
    echo  [ERREUR] Synchronisation Prisma refusee. Aucune option de perte de donnees ne sera appliquee.
    cd /d "%ROOT%"
    pause & exit /b 1
)
echo  [OK] Tables creees/mises a jour par Prisma.

REM ── Étape 6b : setup-db.js (colonnes manquantes sur DB existante, idempotent) ─
echo  [6b] Application des migrations complementaires...
node setup-db.js
if errorlevel 1 (
    echo  [ERREUR] La synchronisation complementaire de la base a echoue.
    cd /d "%ROOT%"
    pause & exit /b 1
)
echo  [OK] Migrations complementaires appliquees sur la meme base SQLite.
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

echo  [INSTALL] Verification et installation des dependances frontend...
echo  SweetAlert2 et toute autre dependance manquante seront installees ici.
echo  Installation depuis package.json (anciens lockfiles ignores pour eviter les erreurs ETARGET).
call npm install --package-lock=false --prefer-offline --no-audit --no-fund
if %errorlevel% neq 0 (
    echo  [ERREUR] npm install frontend a echoue.
    cd /d "%ROOT%"
    pause & exit /b 1
)
echo  [OK] Dependances frontend presentes, dont SweetAlert2 si declare.
cd /d "%ROOT%"
echo.

REM ══════════════════════════════════════════════════════════════════════════
REM  ÉTAPE 8 — Démarrage des serveurs
REM ══════════════════════════════════════════════════════════════════════════
echo  [8/8] Demarrage des serveurs...
echo  Le backend et le frontend seront ouverts dans des fenetres separees.
echo.

REM ── Backend ───────────────────────────────────────────────────────────────
start "BOTORA Backend — port 3001" cmd /k "chcp 65001 >nul && title BOTORA Backend && cd /d "%ROOT%\backend" && set PUPPETEER_SKIP_DOWNLOAD=true && set PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true && echo. && echo  Backend demarre sur http://localhost:3001 && echo  Fermez cette fenetre pour arreter le backend. && echo. && npm run dev"

echo  Attente de la disponibilite de l'API...
set "BACKEND_READY=0"
for /L %%i in (1,1,30) do (
    if "!BACKEND_READY!"=="0" (
        curl.exe --fail --silent http://127.0.0.1:3001/api/healthz >nul 2>&1
        if !errorlevel! equ 0 set "BACKEND_READY=1"
        if "!BACKEND_READY!"=="0" timeout /t 1 /nobreak >nul
    )
)
if "!BACKEND_READY!"=="0" (
    echo  [ERREUR] L'API ne repond pas. Consultez la fenetre Backend.
    pause & exit /b 1
)
echo  [OK] API disponible.

REM ── Frontend ──────────────────────────────────────────────────────────────
start "BOTORA Frontend — port 5173" cmd /k "chcp 65001 >nul && title BOTORA Frontend && cd /d "%ROOT%\frontend" && echo. && echo  Frontend demarre sur http://localhost:5173 && echo  Fermez cette fenetre pour arreter le frontend. && echo. && npm run dev"

echo  Attente de la disponibilite de l'interface...
set "FRONTEND_READY=0"
for /L %%i in (1,1,30) do (
    if "!FRONTEND_READY!"=="0" (
        curl.exe --fail --silent http://127.0.0.1:5173/ >nul 2>&1
        if !errorlevel! equ 0 set "FRONTEND_READY=1"
        if "!FRONTEND_READY!"=="0" timeout /t 1 /nobreak >nul
    )
)
if "!FRONTEND_READY!"=="0" (
    echo  [ERREUR] Le frontend ne repond pas. Consultez la fenetre Frontend.
    pause & exit /b 1
)
echo  [OK] Interface disponible.

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
exit /b 0
