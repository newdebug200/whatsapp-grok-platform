# Botora Desktop

Botora Desktop is a small Electron client for the hosted Botora user dashboard.
It does not include the backend, a database, WhatsApp sessions, or API secrets.
The installed app and the website use the same hosted service.

## Development

Run the frontend Vite server and backend as usual, then start the desktop shell:

```powershell
$env:BOTORA_DESKTOP_URL = "http://localhost:5173/"
npm run desktop
```

The development command allows HTTP only for localhost. Distribution builds
require an HTTPS URL.

## Build installers

Install dependencies and build the frontend from `frontend/`, then set the
public HTTPS URL of the **Botora user dashboard** (not the Botora Admin site):

```powershell
$env:BOTORA_DESKTOP_URL = "https://your-public-botora-dashboard.example/"
npm ci
npm run desktop:dist:win
```

The Windows NSIS installer is written to `frontend/release/`. Ubuntu packages
are built on an Ubuntu runner with:

```bash
BOTORA_DESKTOP_URL="https://your-public-botora-dashboard.example/" npm ci
BOTORA_DESKTOP_URL="https://your-public-botora-dashboard.example/" npm run desktop:dist:linux
```

The Ubuntu `.deb` package is written to `frontend/release/`. Windows installers
must be built on Windows, and Linux packages on Linux.

## GitHub Actions builds

The **Botora Desktop** workflow runs on pushes to `work_desktop` and can also
be started manually. Set the repository Actions variable `BOTORA_DESKTOP_URL`
to the public HTTPS URL of the user dashboard. The workflow builds a Windows
`.exe` and Ubuntu `.deb`, then makes them available as Actions artifacts for
30 days. If the variable is missing, tests and the web build still run, but
installer packaging is skipped.

Download the artifacts and upload the `.exe` and `.deb` to the downloads area
of the Botora website. Do not publish an installer until this variable points
to the public user dashboard; `localhost` and the Botora Admin site are not
valid distribution targets.

The Windows installer is currently unsigned. Configure an Authenticode
certificate in the release pipeline before distributing it to customers.
Signing reduces publisher warnings but does not guarantee SmartScreen will
have established reputation for a new application.
