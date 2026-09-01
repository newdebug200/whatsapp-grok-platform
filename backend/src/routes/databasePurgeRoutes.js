const express = require('express');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const prisma = require('../prisma');

const router = express.Router();
const execFileAsync = promisify(execFile);
const purgeSchemaPath = path.resolve(__dirname, '../../prisma/schema.prisma');
const purgeProjectRoot = path.resolve(__dirname, '../..');
let purgeInProgress = false;

function constantTimeEqual(left, right) {
  if (!left || !right) return false;
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function sqlitePath() {
  const configured = String(process.env.DATABASE_URL || 'file:./dev.db').replace(/^file:/, '').split('?')[0];
  if (!configured || configured === ':memory:') return null;
  return path.isAbsolute(configured) ? configured : path.resolve(path.dirname(purgeSchemaPath), configured);
}

function prismaCliPath() {
  const candidates = [
    path.resolve(purgeProjectRoot, 'node_modules/.bin/prisma'),
    path.resolve(purgeProjectRoot, '../node_modules/.bin/prisma')
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

async function resetDatabase() {
  const databasePath = sqlitePath();
  if (!databasePath) throw new Error('DATABASE_URL doit pointer vers une base SQLite persistante.');
  const cli = prismaCliPath();
  if (!cli) throw new Error('Prisma CLI introuvable sur le serveur.');

  await prisma.$disconnect();
  for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
    try { fs.rmSync(file, { force: true }); } catch (error) { throw new Error(`Impossible de supprimer ${file}: ${error.message}`); }
  }

  try {
    await execFileAsync(cli, ['db', 'push', '--force-reset', '--accept-data-loss', '--schema', purgeSchemaPath], {
      cwd: purgeProjectRoot,
      env: process.env,
      timeout: 120000,
      maxBuffer: 2 * 1024 * 1024
    });
  } finally {
    await prisma.$connect().catch(() => {});
  }
}

router.all('/', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).json({ ok: false, error: 'Méthode non autorisée.' });

  const enabled = process.env.ALLOW_LOCAL_DB_PURGE === 'true';
  const expectedToken = process.env.PURGE_DB_TOKEN;
  const providedToken = req.get('x-db-purge-token') || req.query.token || req.body?.token;
  const confirmed = req.query.confirm === 'PURGE' || req.body?.confirm === 'PURGE';
  if (!enabled || !expectedToken || !constantTimeEqual(providedToken, expectedToken) || !confirmed) {
    return res.status(404).json({ ok: false, error: 'Ressource introuvable.' });
  }
  if (purgeInProgress) return res.status(409).json({ ok: false, error: 'Une réinitialisation est déjà en cours.' });
  purgeInProgress = true;
  try {
    await resetDatabase();
    return res.json({ ok: true, message: 'Base locale supprimée et schéma recréé.', database: 'sqlite', reset_at: new Date().toISOString() });
  } catch (error) {
    console.error('[DB purge] Échec:', error);
    return res.status(500).json({ ok: false, error: 'La réinitialisation de la base locale a échoué.' });
  } finally {
    purgeInProgress = false;
  }
});

module.exports = router;
