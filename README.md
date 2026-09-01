# SanRobot — Plateforme WhatsApp IA multi-utilisateurs

SanRobot est une plateforme web qui permet à chaque utilisateur de connecter son propre numéro WhatsApp et de configurer un bot IA qui répond automatiquement aux messages entrants, grâce à l'API Groq (LLaMA 3.3 70B).

## Fonctionnalités

- **Multi-tenant** : chaque compte a son propre WhatsApp, bot et FAQ isolés
- **Interface WhatsApp Web** : clone fidèle (liste de conversations, bulles de messages, séparateurs de date, double-coche)
- **Bot IA Groq** : répond automatiquement selon les informations et le comportement configurés
- **FAQ** : questions/réponses intégrées au contexte du bot
- **PWA installable** : bureau (Chrome/Edge) + mobile Android + iPhone (Safari)
- **Temps réel** : Socket.io pour les nouveaux messages et le QR code
- **Auth JWT** : inscription/connexion sécurisées, token 7 jours

## Stack technique

| Couche | Technologie |
|---|---|
| Frontend | React 18, Vite, Axios, Socket.io-client, date-fns |
| Backend | Express 4, Socket.io, JWT, bcryptjs |
| Base de données | SQLite via Prisma ORM |
| IA | Groq API (llama-3.3-70b-versatile) |
| WhatsApp | whatsapp-web.js + Puppeteer |
| PWA | manifest.json, Service Worker manuel |

## Installation rapide

```bash
# 1. Cloner et aller sur la branche work
git clone https://github.com/debugStaut200/whatsapp-grok-platform.git
cd whatsapp-grok-platform
git checkout work

# 2. Backend
cd backend
cp .env.example .env          # puis éditer .env avec vos clés
npm install
npx prisma generate
npx prisma migrate dev --name init
npm run dev                   # port 3001

# 3. Frontend (nouveau terminal)
cd ../frontend
cp .env.example .env
npm install
npm run dev                   # port 5173
```

Consultez **INSTALL.txt** pour le guide complet incluant la PWA.

## Variables d'environnement

**backend/.env**
```
PORT=3001
DATABASE_URL=file:./dev.db
GROK_API_KEY=votre_clé_groq    # https://console.groq.com/keys
JWT_SECRET=clé_secrète_longue
```

**frontend/.env**
```
VITE_API_URL=http://localhost:3001/api
VITE_SOCKET_URL=http://localhost:3001
```

## Structure du projet

```
whatsapp-grok-platform/
├── backend/
│   ├── prisma/schema.prisma         # Modèles : Account, WhatsAppSession, BotConfig, Contact, Message, FAQ
│   └── src/
│       ├── server.js                # Express + Socket.io + restauration sessions
│       ├── middleware/auth.js       # JWT middleware
│       ├── routes/
│       │   ├── authRoutes.js        # POST /register, POST /login, GET /me
│       │   ├── messageRoutes.js     # GET /conversations, GET /conversation/:id, POST /connect, POST /logout
│       │   ├── faqRoutes.js         # CRUD /faq
│       │   └── configRoutes.js      # GET/PUT /config/bot
│       └── services/
│           ├── whatsappManager.js   # Gestion multi-comptes WhatsApp (LocalAuth)
│           └── messageHandler.js   # Filtrage, sauvegarde DB, appel Groq API
└── frontend/
    ├── public/
    │   ├── manifest.json            # PWA : icônes, shortcuts, display standalone
    │   ├── sw.js                    # Service Worker stale-while-revalidate
    │   └── icons/                   # 72→512px + maskable + apple-touch-icon
    └── src/
        ├── context/AuthContext.jsx  # Auth globale + axios header automatique
        ├── components/
        │   ├── auth/AuthPage.jsx    # Login / Register
        │   ├── dashboard/           # Dashboard, ConversationList, ChatWindow, BotConfig, FAQManager
        │   └── pwa/InstallPrompt.jsx # Bannière install Android/Desktop + guide iOS
        └── App.jsx
```

## Réinitialisation complète de la base locale

L’endpoint destructif `GET /purge/now/quick` ouvre une page de maintenance protégée par une double confirmation web. La première page explique les conséquences et propose **Annuler** ou **Confirmer**. Le bouton **Annuler** retourne à l’application ; selon l’état de la session, l’application affiche la connexion ou le dashboard. Le bouton **Confirmer** ouvre une seconde page demandant de confirmer explicitement le caractère irréversible de l’opération. La purge ne démarre qu’après cette deuxième validation.

La seconde confirmation utilise un nonce temporaire de cinq minutes, à usage unique, conservé côté serveur. L’opération supprime la base SQLite et ses fichiers WAL/SHM, puis recrée le schéma avec `prisma db push --force-reset`. Elle supprime définitivement les comptes, conversations, réglages, messages, paiements locaux et sessions enregistrées ; elle ne doit donc être utilisée que sur une instance locale ou de maintenance.

## Utilisation

1. Créer un compte sur `http://localhost:5173`
2. Aller dans **Bot Config** → Connecter WhatsApp → scanner le QR code
3. Renseigner les informations du bot (domaine, comportement, FAQ)
4. Envoyer un message WhatsApp au numéro connecté → le bot répond

## Numérotation

Les numéros de téléphone sont affichés au format international : `+22915758565`

## Licence

MIT
