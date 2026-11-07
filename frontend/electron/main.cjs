'use strict';

const { app, BrowserWindow, session, shell } = require('electron');
const path = require('node:path');
const { appUrl } = require('./app-url.json');

const trustedOrigin = new URL(appUrl).origin;
let mainWindow;

function isTrustedAppUrl(value) {
  try {
    const url = new URL(value);
    return url.origin === trustedOrigin;
  } catch {
    return false;
  }
}

function openExternalUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' || url.protocol === 'http:') {
      shell.openExternal(url.href).catch(error => {
        console.error('Unable to open external link:', error);
      });
    }
  } catch {
    console.warn('Blocked an invalid external link.');
  }
}

function configurePermissions() {
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback, details) => {
    const requestingUrl = details?.requestingUrl || webContents.getURL();
    const trusted = isTrustedAppUrl(requestingUrl);
    const mediaTypes = details?.mediaTypes || [];
    const allowed = trusted && (
      permission === 'notifications'
      || (permission === 'media' && mediaTypes.includes('audio') && !mediaTypes.includes('video'))
    );
    callback(allowed);
  });
}

function createWindow() {
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

  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (isTrustedAppUrl(url)) {
      mainWindow.loadURL(url);
    } else {
      openExternalUrl(url);
    }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isTrustedAppUrl(url)) return;
    event.preventDefault();
    openExternalUrl(url);
  });
  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    console.error('Botora Desktop renderer stopped:', details.reason);
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  mainWindow.loadURL(appUrl).catch(error => {
    console.error('Unable to load Botora:', error);
  });
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.setAppUserModelId('com.bluelifetech.botora.desktop');
  app.whenReady().then(() => {
    configurePermissions();
    createWindow();
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
