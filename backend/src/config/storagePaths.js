'use strict';

const path = require('node:path');

function resolveStoragePaths(env = process.env, backendRoot = path.resolve(__dirname, '../..')) {
  const dataDirectory = path.resolve(env.BOTORA_DATA_DIR || backendRoot);
  return {
    DATA_DIR: dataDirectory,
    UPLOADS_DIR: path.join(dataDirectory, 'uploads'),
    WHATSAPP_AUTH_DIR: path.join(dataDirectory, '.wwebjs_auth')
  };
}

module.exports = {
  ...resolveStoragePaths(),
  resolveStoragePaths
};
