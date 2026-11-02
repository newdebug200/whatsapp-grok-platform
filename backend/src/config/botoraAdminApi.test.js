'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
  LOCAL_ADMIN_API,
  ONLINE_ADMIN_API,
  resolveBotoraAdminApiUrl,
  resolveBotoraAdminServiceKey
} = require('./botoraAdminApi');

test('auto mode uses the local Botora Admin API by default', () => {
  assert.equal(resolveBotoraAdminApiUrl({}), LOCAL_ADMIN_API);
  assert.equal(resolveBotoraAdminApiUrl({ NODE_ENV: 'development' }), LOCAL_ADMIN_API);
});

test('auto mode uses the online API in production', () => {
  assert.equal(resolveBotoraAdminApiUrl({ NODE_ENV: 'production' }), ONLINE_ADMIN_API);
});

test('auto mode detects public and local APP_URL values', () => {
  assert.equal(resolveBotoraAdminApiUrl({ APP_URL: 'https://botora.example.com' }), ONLINE_ADMIN_API);
  assert.equal(resolveBotoraAdminApiUrl({ APP_URL: 'http://localhost:3001' }), LOCAL_ADMIN_API);
  assert.equal(resolveBotoraAdminApiUrl({ APP_URL: 'http://192.168.1.25:3001' }), LOCAL_ADMIN_API);
  assert.equal(resolveBotoraAdminApiUrl({ APP_URL: 'https://your-domain.example' }), ONLINE_ADMIN_API);
});

test('explicit mode can force either API', () => {
  assert.equal(resolveBotoraAdminApiUrl({ BOTORA_ADMIN_API_MODE: 'local', NODE_ENV: 'production' }), LOCAL_ADMIN_API);
  assert.equal(resolveBotoraAdminApiUrl({ BOTORA_ADMIN_API_MODE: 'online', NODE_ENV: 'development' }), ONLINE_ADMIN_API);
});

test('an explicit API URL overrides automatic detection', () => {
  assert.equal(
    resolveBotoraAdminApiUrl({ BOTORA_ADMIN_API_URL: 'http://localhost:8000/', NODE_ENV: 'production' }),
    LOCAL_ADMIN_API
  );
});

test('uses the development service key only for local API communication', () => {
  assert.equal(resolveBotoraAdminServiceKey({}), 'abcd');
  assert.equal(
    resolveBotoraAdminServiceKey({ NODE_ENV: 'production' }, ONLINE_ADMIN_API),
    ''
  );
  assert.equal(
    resolveBotoraAdminServiceKey({ BOTORA_ADMIN_SERVICE_KEY: 'shared-secret' }, ONLINE_ADMIN_API),
    'shared-secret'
  );
});

test('rejects invalid mode, URL and app URL settings', () => {
  assert.throws(() => resolveBotoraAdminApiUrl({ BOTORA_ADMIN_API_MODE: 'remote' }));
  assert.throws(() => resolveBotoraAdminApiUrl({ BOTORA_ADMIN_API_URL: 'file:///tmp/api' }));
  assert.throws(() => resolveBotoraAdminApiUrl({ APP_URL: 'not a URL' }));
});
