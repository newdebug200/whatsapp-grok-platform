'use strict';

const ONLINE_ADMIN_API = 'https://botora.bluelifetech.site';
const LOCAL_ADMIN_API = 'http://localhost:8000';

function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (
    host === 'localhost'
    || host === '0.0.0.0'
    || host.endsWith('.localhost')
    || host.endsWith('.local')
  ) {
    return true;
  }

  const ipv4 = host.split('.').map(Number);
  if (ipv4.length === 4 && ipv4.every(part => Number.isInteger(part) && part >= 0 && part <= 255)) {
    return ipv4[0] === 10
      || ipv4[0] === 127
      || (ipv4[0] === 169 && ipv4[1] === 254)
      || (ipv4[0] === 172 && ipv4[1] >= 16 && ipv4[1] <= 31)
      || (ipv4[0] === 192 && ipv4[1] === 168);
  }

  return host === '::1' || host.startsWith('fc') || host.startsWith('fd') || host.startsWith('fe80:');
}

function resolveBotoraAdminApiUrl(env = process.env) {
  const configuredUrl = env.BOTORA_ADMIN_API_URL?.trim();
  if (configuredUrl) return normalizeUrl(configuredUrl);

  const mode = (env.BOTORA_ADMIN_API_MODE || 'auto').trim().toLowerCase();
  if (!['auto', 'local', 'online'].includes(mode)) {
    throw new Error('BOTORA_ADMIN_API_MODE must be auto, local, or online.');
  }
  if (mode === 'local') return LOCAL_ADMIN_API;
  if (mode === 'online') return ONLINE_ADMIN_API;

  if ((env.NODE_ENV || '').trim().toLowerCase() === 'production') {
    return ONLINE_ADMIN_API;
  }

  const appUrl = env.APP_URL?.trim();
  if (appUrl) {
    let hostname;
    try {
      hostname = new URL(appUrl).hostname;
    } catch {
      throw new Error('APP_URL must be a valid URL to detect the Botora Admin API.');
    }
    if (!['http:', 'https:'].includes(new URL(appUrl).protocol)) {
      throw new Error('APP_URL must use HTTP or HTTPS to detect the Botora Admin API.');
    }
    if (!isLocalHostname(hostname)) return ONLINE_ADMIN_API;
  }

  return LOCAL_ADMIN_API;
}

function resolveBotoraAdminServiceKey(env = process.env, apiUrl = resolveBotoraAdminApiUrl(env)) {
  const configuredKey = env.BOTORA_ADMIN_SERVICE_KEY?.trim();
  if (configuredKey) return configuredKey;
  return isLocalHostname(new URL(apiUrl).hostname) ? 'abcd' : '';
}

function normalizeUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('BOTORA_ADMIN_API_URL must be a valid URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('BOTORA_ADMIN_API_URL must use HTTP or HTTPS.');
  }
  return value.replace(/\/+$/, '');
}

module.exports = {
  LOCAL_ADMIN_API,
  ONLINE_ADMIN_API,
  resolveBotoraAdminApiUrl,
  resolveBotoraAdminServiceKey
};
