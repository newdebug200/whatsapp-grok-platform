# Botora Desktop

Botora Desktop is a local Electron application for Windows and Ubuntu. It
packages the Botora web interface, Node.js backend, SQLite schema, WhatsApp
browser runtime, and WhatsApp session support. The local backend runs only on
the user's computer; it does not need a public dashboard or public API URL.

Botora Admin at `https://botora.bluelifetech.site` remains the online central
service for account, subscription, and credit information. Desktop users need
an Internet connection for central account checks, WhatsApp, and Groq AI.

## User data and AI access

The local database, WhatsApp sessions, uploaded media, and backend log are
stored in Electron's per-user `userData` directory. They are kept outside the
installation directory so app upgrades do not erase them.

Desktop AI requests are sent over HTTPS to the Botora Admin proxy. The Groq
credential and proxy signing secret stay on that server; users never enter a
Groq key, and neither secret is included in the installer. Users must sign in
online to receive a seven-day AI session token. The proxy checks account access,
credits, and rate limits before forwarding a request to Groq.

## Development

Install the frontend dependencies, start the Vite server, and then launch
Electron. Electron starts the local backend and creates its database and data
directories automatically:

```powershell
cd frontend
npm ci
npm run dev
```

In another terminal:

```powershell
cd frontend
npm run desktop
```

Development requires the backend dependencies and a Puppeteer Chrome install.
From `backend/`, run `npm ci`; Puppeteer installs its browser during this step.

## Build installers

Build on the target operating system. The packaging script stages the backend,
installs platform-specific dependencies, downloads the WhatsApp Chromium
runtime, generates the frontend with its local API URLs, and packages the app:

```powershell
cd frontend
npm ci
npm run desktop:dist:win
```

The Windows NSIS installer is written to `frontend/release/`.

On Ubuntu:

```bash
cd frontend
npm ci
npm run desktop:dist:linux
```

The `.deb` package is written to `frontend/release/`. Installer generation
requires an Internet connection and downloads a Chromium runtime, so the
installers are substantially larger than the website frontend alone.

## GitHub Actions

The **Botora Desktop** workflow runs tests and builds Windows `.exe` and Ubuntu
`.deb` artifacts on their native runners. It does not require a public Botora
dashboard URL. Download the generated Actions artifacts to test or distribute
them; a download website can be set up later.

The Windows installer is unsigned. An Authenticode certificate is required to
identify the publisher, and signing does not guarantee SmartScreen reputation
for a new application.
