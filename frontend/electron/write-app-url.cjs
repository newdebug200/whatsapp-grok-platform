'use strict';

const fs = require('node:fs');
const path = require('node:path');

function normalizeAppUrl(value, { allowLocal = false } = {}) {
  if (!value) {
    throw new Error('BOTORA_DESKTOP_URL must be set to the public Botora user dashboard URL.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BOTORA_DESKTOP_URL must be a valid absolute URL.');
  }

  const isLocalHost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (url.protocol !== 'https:' && !(allowLocal && isLocalHost && url.protocol === 'http:')) {
    throw new Error('Botora Desktop requires an HTTPS URL; HTTP is only accepted for local development.');
  }
  if (url.username || url.password) {
    throw new Error('BOTORA_DESKTOP_URL must not contain credentials.');
  }

  return url.href;
}

function writeAppUrl(value, options) {
  const appUrl = normalizeAppUrl(value, options);
  const configPath = path.join(__dirname, 'app-url.json');
  fs.writeFileSync(configPath, `${JSON.stringify({ appUrl }, null, 2)}\n`, 'utf8');
  return configPath;
}

if (require.main === module) {
  try {
    const configPath = writeAppUrl(process.env.BOTORA_DESKTOP_URL, {
      allowLocal: process.argv.includes('--allow-local')
    });
    console.log(`Botora Desktop target configured in ${configPath}`);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}

module.exports = { normalizeAppUrl, writeAppUrl };
