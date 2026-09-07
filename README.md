# SanRobot — Plateforme WhatsApp IA multi-utilisateurs

SanRobot est une plateforme web qui permet à chaque utilisateur de connecter son propre numéro WhatsApp et de configurer un bot IA qui répond automatiquement aux messages entrants, grâce à l'API Groq (`openai/gpt-oss-20b`).

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
| IA | Groq API (`openai/gpt-oss-20b`) |
| WhatsApp | whatsapp-web.js + Puppeteer |
| PWA | manifest.json, Service Worker manuel |

## Installation rapide

```bash
# 1. Cloner et aller sur la branche work
git clone https://github.com/newdebug200/whatsapp-grok-platform.git
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

## API publique

La base des endpoints publics est `/api/v1`. Toutes les routes publiques nécessitent une clé API active dans l’un des en-têtes suivants :

```http
X-API-Key: btr_live_...
```

ou :

```http
Authorization: Bearer btr_live_...
```

Les clés API sont créées depuis l’espace utilisateur. Elles sont propres au compte Botora, peuvent être révoquées individuellement et ne doivent jamais être exposées dans du code frontend ou un dépôt public. Les routes utilisent le premier profil WhatsApp connecté du compte, sauf si `profile_id` est fourni.

### Envoyer un message

```http
POST /api/v1/messages/send
Content-Type: application/json
```

Corps minimal :

```json
{
  "to": "229XXXXXXXX",
  "message": "Bonjour !"
}
```

`to` accepte également les alias `recipient`, `phone` et `number`. Le numéro doit être fourni au format international, avec ou sans signe `+`. Pour choisir un compte WhatsApp précis, ajouter `profile_id`.

Réponse réussie :

```json
{
  "ok": true,
  "status": "sent",
  "message_id": "true_229XXXXXXXX@c.us_...",
  "recipient": "229XXXXXXXX@c.us",
  "profile_id": 1,
  "type": "text"
}
```

### Vérifier un numéro WhatsApp

Cet endpoint interroge WhatsApp à partir d’une session déjà connectée. Il ne se contente pas de valider la structure du numéro : `is_whatsapp` indique si WhatsApp renvoie un identifiant pour ce numéro.

```http
POST /api/v1/whatsapp/check-number
Content-Type: application/json
```

Requête :

```json
{
  "phone_number": "229XXXXXXXX",
  "profile_id": 1
}
```

Le champ `phone_number` accepte aussi les alias `phone` et `number`. Le champ `profile_id` est facultatif. Le numéro est normalisé en format international avec `+` dans la réponse.

Réponse si le numéro est enregistré sur WhatsApp :

```json
{
  "ok": true,
  "phone_number": "+229XXXXXXXX",
  "is_whatsapp": true,
  "profile_id": 1,
  "whatsapp_id": "229XXXXXXXX@c.us"
}
```

Réponse si le numéro n’est pas enregistré sur WhatsApp :

```json
{
  "ok": true,
  "phone_number": "+229XXXXXXXX",
  "is_whatsapp": false,
  "profile_id": 1,
  "whatsapp_id": null
}
```

### Vérifier plusieurs numéros

```http
POST /api/v1/whatsapp/check-numbers
Content-Type: application/json
```

Requête :

```json
{
  "profile_id": 1,
  "numbers": ["229XXXXXXXX", "+229YYYYYYYY", "229ZZZZZZZZ"]
}
```

La limite est de 100 numéros par requête. Chaque élément retourne son index d’origine, le numéro normalisé et un statut : `checked`, `invalid` ou `error`.

Réponse :

```json
{
  "ok": true,
  "profile_id": 1,
  "total": 3,
  "whatsapp": 2,
  "not_whatsapp": 1,
  "results": [
    {"index": 0, "phone_number": "+229XXXXXXXX", "is_whatsapp": true, "status": "checked"},
    {"index": 1, "phone_number": "+229YYYYYYYY", "is_whatsapp": false, "status": "checked"},
    {"index": 2, "phone_number": "+229ZZZZZZZZ", "is_whatsapp": true, "status": "checked"}
  ]
}
```

### Erreurs communes

| Code HTTP | Code API | Signification |
|---:|---|---|
| 400 | — | Numéro invalide, corps absent ou lot vide/trop grand |
| 401 | `API_KEY_REQUIRED` / `API_KEY_INVALID` | Clé absente, invalide ou révoquée |
| 403 | `SUBSCRIPTION_REQUIRED` | L’accès API du compte n’est pas autorisé |
| 502 | `WHATSAPP_CHECK_FAILED` | Vérification WhatsApp temporairement indisponible |
| 503 | `WHATSAPP_PROFILE_REQUIRED` | Aucun profil WhatsApp connecté |
| 503 | `WHATSAPP_NOT_CONNECTED` | Le profil demandé n’est pas actuellement connecté |

Les endpoints de vérification ne peuvent fonctionner que lorsqu’au moins un profil WhatsApp est connecté et opérationnel.

## Numérotation

Les numéros de téléphone sont affichés au format international : `+22915758565`

## Licence

MIT
