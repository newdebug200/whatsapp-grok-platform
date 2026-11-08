'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { fileURLToPath } = require('node:url');
const { createPrismaSqliteUrl } = require('./sqliteDatabaseUrl.cjs');

test('creates a Prisma SQLite URL for an absolute database path', () => {
  const databasePath = path.resolve('Botora data', 'botora #1.sqlite');
  const url = createPrismaSqliteUrl(databasePath);

  assert.ok(url.startsWith('file:'));
  assert.equal(fileURLToPath(new URL(url)), databasePath);
  assert.match(url, /%20/);
  assert.match(url, /%23/);
  if (process.platform === 'win32') {
    assert.match(url, /^file:[A-Z]:\//i);
  }
});
