'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const frontendDirectory = path.resolve(__dirname, '..');
const backendDirectory = path.resolve(frontendDirectory, '..', 'backend');
const stagingDirectory = path.join(frontendDirectory, '.desktop-staging', 'backend');
const browserCacheDirectory = path.join(stagingDirectory, '.desktop-browser-cache');

function runNodeScript(scriptPath, args, cwd, env) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`Command failed (${result.status ?? result.signal}): ${scriptPath} ${args.join(' ')}`);
  }
}

function runNpm(args, cwd, env) {
  const npmCliPath = process.env.npm_execpath;
  if (!npmCliPath) {
    throw new Error('Lancez la génération avec npm run desktop:dist:win ou npm run desktop:dist:linux.');
  }
  const result = spawnSync(process.execPath, [npmCliPath, ...args], {
    cwd,
    env,
    stdio: 'inherit',
    windowsHide: true
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`npm ${args.join(' ')} a échoué (${result.status ?? result.signal}).`);
  }
}

function shouldCopyBackendEntry(sourcePath) {
  const relativePath = path.relative(backendDirectory, sourcePath);
  if (!relativePath) return true;

  const segments = relativePath.split(path.sep);
  if (segments.some(segment => [
    '.git',
    '.tsupgrader',
    '.wwebjs_auth',
    '.wwebjs_cache',
    '.desktop-browser-cache',
    'uploads',
    'logs'
  ].includes(segment))) return false;
  if (segments.includes('node_modules')) return false;
  if (segments.at(-1) === '.env') return false;
  if (/\.(?:db|sqlite)(?:[-.].*)?$/i.test(segments.at(-1))) return false;
  if (/\.(?:test|spec)\.[cm]?js$/i.test(segments.at(-1))) return false;
  return true;
}

function stageBackend() {
  fs.rmSync(path.dirname(stagingDirectory), { recursive: true, force: true });
  fs.mkdirSync(path.dirname(stagingDirectory), { recursive: true });
  fs.cpSync(backendDirectory, stagingDirectory, {
    recursive: true,
    filter: shouldCopyBackendEntry
  });
}

function moveBackendDependencies() {
  const dependenciesDirectory = path.join(stagingDirectory, 'dependencies');
  fs.mkdirSync(dependenciesDirectory, { recursive: true });
  fs.renameSync(
    path.join(stagingDirectory, 'node_modules'),
    path.join(dependenciesDirectory, 'node_modules')
  );
}

function removeBuildOnlyBackendFiles() {
  for (const relativePath of [
    'node_modules/prisma',
    'node_modules/.cache/prisma'
  ]) {
    fs.rmSync(path.join(stagingDirectory, relativePath), { recursive: true, force: true });
  }
}

function build() {
  const target = process.argv[2];
  if (!['--win', '--linux'].includes(target)) {
    throw new Error('Cible attendue : --win ou --linux.');
  }

  stageBackend();
  const env = {
    ...process.env,
    PUPPETEER_CACHE_DIR: browserCacheDirectory,
    PUPPETEER_CHROME_SKIP_DOWNLOAD: 'true',
    VITE_API_URL: 'http://127.0.0.1:3001/api',
    VITE_SOCKET_URL: 'http://127.0.0.1:3001',
    VITE_DESKTOP: 'true'
  };
  delete env.PUPPETEER_SKIP_DOWNLOAD;

  try {
    runNpm(['ci'], stagingDirectory, env);
    runNpm(['exec', '--', 'prisma', 'generate'], stagingDirectory, env);
    runNpm(['prune', '--omit=dev'], stagingDirectory, env);
    removeBuildOnlyBackendFiles();
    moveBackendDependencies();
    runNpm(['run', 'build'], frontendDirectory, env);
    if (target === '--win') {
      runNodeScript(path.join(__dirname, 'prepare-icons.cjs'), [], frontendDirectory, env);
      runNpm(['exec', '--', 'electron-builder', '--win', 'nsis'], frontendDirectory, env);
    } else {
      runNpm(['exec', '--', 'electron-builder', '--linux', 'deb'], frontendDirectory, env);
    }
  } finally {
    fs.rmSync(path.dirname(stagingDirectory), { recursive: true, force: true });
  }
}

try {
  build();
} catch (error) {
  console.error('Échec de la génération du paquet Botora Desktop:', error.message);
  process.exitCode = 1;
}
