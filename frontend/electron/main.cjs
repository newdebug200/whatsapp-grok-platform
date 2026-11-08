'use strict';

const {
  app,
  BrowserWindow,
  dialog,
  session,
  shell
} = require('electron');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { fileURLToPath, pathToFileURL } = require('node:url');

const API_ORIGIN = 'http://127.0.0.1:3001';
const DEV_UI_ORIGIN = 'http://localhost:5173';
let backendProcess;
let mainWindow;
let runtimeConfig;

function getBackendPath() {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'backend')
    : path.resolve(__dirname, '..', '..', 'backend');
}

function getDataPath(...parts) {
  return path.join(app.getPath('userData'), ...parts);
}

function readRuntimeConfig() {
  const configPath = getDataPath('desktop-config.json');
  let config;
  if (fs.existsSync(configPath)) {
    config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } else {
    config = {};
  }

  delete config.encryptedGroqApiKey;
  if (typeof config.jwtSecret !== 'string' || config.jwtSecret.length < 32) {
    config.jwtSecret = crypto.randomBytes(48).toString('hex');
  }

  runtimeConfig = { configPath, config };
  writeRuntimeConfig();
  return runtimeConfig;
}

function writeRuntimeConfig(config = runtimeConfig.config) {
  const { configPath } = runtimeConfig;
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, {
    encoding: 'utf8',
    mode: 0o600
  });
}

function createBackendEnvironment() {
  const dataPath = app.getPath('userData');
  fs.mkdirSync(dataPath, { recursive: true });

  return {
    ...process.env,
    NODE_ENV: 'production',
    BOTORA_ADMIN_API_MODE: 'online',
    BOTORA_ADMIN_AI_PROXY: 'true',
    BOTORA_DATA_DIR: dataPath,
    DATABASE_URL: pathToFileURL(getDataPath('botora.sqlite')).href,
    GROQ_API_KEY: '',
    GROK_API_KEY: '',
    HOST: '127.0.0.1',
    PORT: '3001',
    JWT_SECRET: runtimeConfig.config.jwtSecret,
    NODE_PATH: path.join(
      getBackendPath(),
      ...(app.isPackaged ? ['dependencies', 'node_modules'] : ['node_modules'])
    ),
    ...(app.isPackaged
      ? { PUPPETEER_CACHE_DIR: path.join(getBackendPath(), '.desktop-browser-cache') }
      : {})
  };
}

function runBackendScript(scriptName, args = []) {
  const backendPath = getBackendPath();
  const result = spawnSync(process.execPath, [path.join(backendPath, scriptName), ...args], {
    cwd: backendPath,
    env: { ...createBackendEnvironment(), ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8',
    timeout: 120000,
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `Préparation locale du backend échouée (${scriptName}).\n${result.stderr || result.stdout || `Code ${result.status}`}`
    );
  }
}

function appendBackendLog(stream, chunk) {
  try {
    fs.appendFileSync(getDataPath('backend.log'), chunk);
  } catch (error) {
    console.error(`Impossible d’écrire le journal du backend: ${error.message}`);
  }
  if (stream === 'stderr') console.error(chunk.toString().trimEnd());
}

async function waitForBackend() {
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    if (backendProcess.exitCode !== null) {
      throw new Error(`Le backend local s’est arrêté (code ${backendProcess.exitCode}). Consultez backend.log dans le dossier Botora de votre profil utilisateur.`);
    }
    try {
      const response = await fetch(`${API_ORIGIN}/api/healthz`, {
        signal: AbortSignal.timeout(1500)
      });
      if (response.ok) return;
    } catch {}
    await new Promise(resolve => setTimeout(resolve, 400));
  }
  throw new Error('Le backend local n’a pas démarré dans le délai prévu. Consultez backend.log dans le dossier Botora de votre profil utilisateur.');
}

async function startBackend() {
  const backendPath = getBackendPath();
  const environment = createBackendEnvironment();
  fs.mkdirSync(getDataPath('uploads'), { recursive: true });
  fs.mkdirSync(getDataPath('.wwebjs_auth'), { recursive: true });

  runBackendScript('setup-db.js');
  backendProcess = spawn(
    process.execPath,
    [path.join(backendPath, 'src', 'server.js')],
    {
      cwd: backendPath,
      env: { ...environment, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true
    }
  );
  backendProcess.stdout.on('data', chunk => appendBackendLog('stdout', chunk));
  backendProcess.stderr.on('data', chunk => appendBackendLog('stderr', chunk));
  backendProcess.on('error', error => {
    console.error('Impossible de démarrer le backend Botora:', error);
  });
  await waitForBackend();
}

function isAppFileUrl(value) {
  try {
    const url = new URL(value);
    if (!app.isPackaged && url.origin === DEV_UI_ORIGIN) return true;
    if (url.protocol !== 'file:') return false;
    const requestedPath = path.resolve(fileURLToPath(url));
    const rendererDirectory = path.resolve(app.getAppPath(), 'dist');
    return requestedPath === path.join(rendererDirectory, 'index.html')
      || requestedPath.startsWith(`${rendererDirectory}${path.sep}`);
  } catch {
    return false;
  }
}

function openExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:') {
      shell.openExternal(url.href).catch(error => {
        console.error('Impossible d’ouvrir le lien externe:', error);
      });
    }
  } catch {
    console.warn('Lien externe invalide bloqué.');
  }
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    const trusted = isAppFileUrl(requestingUrl);
    const mediaTypes = details?.mediaTypes || [];
    callback(trusted && (
      permission === 'notifications'
      || (permission === 'media' && mediaTypes.includes('audio') && !mediaTypes.includes('video'))
    ));
  });
}

function createWindow() {
  const isSmokeTest = process.argv.includes('--smoke-test');
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 600,
    show: false,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '..', 'public', 'icons', 'icon-512.png'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true
    }
  });

  mainWindow.once('ready-to-show', () => {
    if (!isSmokeTest) mainWindow.show();
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isAppFileUrl(url)) {
      mainWindow.loadURL(url);
    } else {
      openExternalUrl(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isAppFileUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Le rendu de Botora Desktop s’est arrêté:', details.reason);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const loadApp = app.isPackaged
    ? mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
    : mainWindow.loadURL(DEV_UI_ORIGIN);
  return loadApp.catch(error => {
    console.error('Impossible de charger Botora Desktop:', error);
    if (isSmokeTest) throw error;
    dialog.showErrorBox('Botora Desktop', `Impossible d’ouvrir l’interface locale.\n${error.message}`);
  });
}

async function verifyRenderer() {
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = await mainWindow.webContents.executeJavaScript(`(() => {
      const root = document.getElementById('root');
      const appElement = root?.firstElementChild;
      const bounds = appElement?.getBoundingClientRect();
      const images = [...(root?.querySelectorAll('img') ?? [])];
      return {
        childCount: root?.childElementCount ?? 0,
        visible: Boolean(bounds && bounds.width > 0 && bounds.height > 0),
        imagesReady: images.length > 0 && images.every(image => image.complete),
        brokenImages: images.filter(image => image.complete && image.naturalWidth === 0).map(image => image.src)
      };
    })()`);
    if (state.visible && state.imagesReady) {
      if (state.brokenImages.length > 0) {
        throw new Error(`Ressources d’image manquantes : ${state.brokenImages.join(', ')}`);
      }
      console.log(`Botora interface rendered successfully (${state.childCount} root element(s)).`);
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('L’interface Botora ne s’est pas affichée. Les ressources de la page ou le rendu React ont échoué.');
}

let isShuttingDown = false;
let applicationExitCode = 0;
app.on('before-quit', event => {
  if (backendProcess && backendProcess.exitCode === null) {
    event.preventDefault();
    if (isShuttingDown) return;
    isShuttingDown = true;
    const forceExitTimer = setTimeout(() => app.exit(1), 15000);
    forceExitTimer.unref();
    backendProcess.once('exit', () => {
      clearTimeout(forceExitTimer);
      app.exit(applicationExitCode);
    });
    backendProcess.kill();
  }
});

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.bluelifetech.botora.desktop');
  app.whenReady().then(async () => {
    readRuntimeConfig();
    configurePermissions();
    await startBackend();
    const appLoaded = createWindow();
    if (process.argv.includes('--smoke-test')) {
      await appLoaded;
      await verifyRenderer();
      app.quit();
      return;
    }
  }).catch(error => {
    console.error('Botora Desktop n’a pas pu démarrer:', error);
    if (!process.argv.includes('--smoke-test')) {
      dialog.showErrorBox('Démarrage de Botora impossible', error.message);
    }
    applicationExitCode = 1;
    app.quit();
  });
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
  app.on('window-all-closed', () => app.quit());
}
