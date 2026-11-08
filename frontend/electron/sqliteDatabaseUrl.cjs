'use strict';

const path = require('node:path');
const { pathToFileURL } = require('node:url');

function createPrismaSqliteUrl(databasePath) {
  const fileUrl = pathToFileURL(path.resolve(databasePath)).href;
  return fileUrl.replace(/^file:\/\/\//, 'file:');
}

module.exports = { createPrismaSqliteUrl };
