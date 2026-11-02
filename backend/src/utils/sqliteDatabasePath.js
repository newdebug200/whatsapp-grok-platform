'use strict';

const path = require('node:path');
const { fileURLToPath, pathToFileURL } = require('node:url');

function resolveSqliteDatabasePath(databaseUrl, schemaPath) {
  const value = String(databaseUrl || '').trim();
  if (!value.startsWith('file:')) {
    throw new Error('DATABASE_URL doit utiliser le format SQLite file:.');
  }

  const url = new URL(value, pathToFileURL(path.resolve(schemaPath)));
  if (url.protocol !== 'file:') {
    throw new Error('DATABASE_URL doit pointer vers un fichier SQLite.');
  }
  const sqlitePath = value.slice('file:'.length).split('?')[0];
  if (sqlitePath === ':memory:' || url.searchParams.get('mode') === 'memory') {
    return null;
  }

  return fileURLToPath(url);
}

module.exports = { resolveSqliteDatabasePath };
