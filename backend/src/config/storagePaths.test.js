'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { resolveStoragePaths } = require('./storagePaths');

test('stores app data beside the backend by default', () => {
  const backendRoot = path.resolve(__dirname, '../..');
  assert.deepEqual(resolveStoragePaths({}, backendRoot), {
    DATA_DIR: backendRoot,
    UPLOADS_DIR: path.join(backendRoot, 'uploads'),
    WHATSAPP_AUTH_DIR: path.join(backendRoot, '.wwebjs_auth')
  });
});

test('puts database support files under the configured user data directory', () => {
  const dataDirectory = path.resolve('desktop-data');
  assert.deepEqual(resolveStoragePaths({ BOTORA_DATA_DIR: dataDirectory }), {
    DATA_DIR: dataDirectory,
    UPLOADS_DIR: path.join(dataDirectory, 'uploads'),
    WHATSAPP_AUTH_DIR: path.join(dataDirectory, '.wwebjs_auth')
  });
});
