'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const { pathToFileURL } = require('node:url');
const { resolveSqliteDatabasePath } = require('./sqliteDatabasePath');

const schemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const schemaDirectory = path.dirname(schemaPath);

test('resolves a relative SQLite URL from the Prisma schema directory', () => {
  assert.equal(
    resolveSqliteDatabasePath('file:./dev.db', schemaPath),
    path.join(schemaDirectory, 'dev.db')
  );
});

test('ignores SQLite URL query parameters when resolving the file', () => {
  assert.equal(
    resolveSqliteDatabasePath('file:./dev.db?connection_limit=1', schemaPath),
    path.join(schemaDirectory, 'dev.db')
  );
});

test('resolves absolute SQLite file URLs and encoded path segments', () => {
  const databasePath = path.join(schemaDirectory, 'data folder', 'db.sqlite');
  assert.equal(
    resolveSqliteDatabasePath(pathToFileURL(databasePath).href, schemaPath),
    databasePath
  );
});

test('returns null for supported in-memory SQLite URLs', () => {
  assert.equal(resolveSqliteDatabasePath('file:./dev.db?mode=memory', schemaPath), null);
  assert.equal(resolveSqliteDatabasePath('file::memory:', schemaPath), null);
});

test('rejects non-SQLite and malformed database URLs', () => {
  assert.throws(() => resolveSqliteDatabasePath('postgresql://localhost/app', schemaPath));
  assert.throws(() => resolveSqliteDatabasePath('file:%', schemaPath));
});
