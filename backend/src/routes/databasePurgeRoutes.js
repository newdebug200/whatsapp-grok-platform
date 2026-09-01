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
let confirmationNonce = null;
let confirmationExpiresAt = 0;

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

function layout(title, body) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
  :root{font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:#172033;background:#f4f7fb}*{box-sizing:border-box}body{min-height:100vh;margin:0;display:grid;place-items:center;padding:24px}.purge-card{width:min(620px,100%);background:#fff;border:1px solid #e4e9f1;border-radius:20px;box-shadow:0 18px 50px rgba(31,45,61,.12);padding:34px}.purge-icon{width:54px;height:54px;border-radius:16px;display:grid;place-items:center;background:#fff1f2;color:#be123c;font-size:27px;margin-bottom:18px}.purge-eyebrow{text-transform:uppercase;letter-spacing:.11em;font-size:11px;font-weight:800;color:#be123c}.purge-card h1{font-size:27px;line-height:1.15;margin:8px 0 12px}.purge-card p{color:#526174;line-height:1.6;margin:10px 0}.purge-warning{background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;color:#9a3412;margin:20px 0}.purge-error{background:#fef2f2;border:1px solid #fecaca;border-radius:12px;padding:14px 16px;color:#991b1b;margin:20px 0}.purge-actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}.purge-actions button,.purge-actions a{border:0;border-radius:10px;padding:12px 18px;font-weight:750;font-size:14px;text-decoration:none;cursor:pointer}.purge-danger{background:#be123c;color:#fff}.purge-secondary{background:#eef2f7;color:#334155}.purge-meta{font-size:12px;color:#7b8798;margin-top:20px}@media(max-width:520px){.purge-card{padding:24px}.purge-actions>*{width:100%;text-align:center}}
</style></head><body><main class="purge-card"><div class="purge-icon">!</div>${body}</main></body></html>`;
}

function firstPage(message = '') {
  return layout('Réinitialiser la base locale', `${message ? `<div class="purge-error">${message}</div>` : ''}<div class="purge-eyebrow">Maintenance WhatsApp Grok Platform</div><h1>Vous souhaitez tout supprimer ?</h1><p>Cette procédure va supprimer entièrement la base de données locale et recréer automatiquement son architecture.</p><div class="purge-warning"><strong>Attention :</strong> tous les comptes, messages, conversations, réglages, paiements locaux et sessions WhatsApp enregistrées seront définitivement supprimés.</div><p>Si vous annulez, vous serez renvoyé vers l’application. Elle ouvrira automatiquement la connexion si vous n’êtes pas connecté, ou le dashboard si une session existe.</p><div class="purge-actions"><a class="purge-secondary" href="/">Annuler</a><form method="post"><input type="hidden" name="action" value="second_confirm"><button class="purge-danger" type="submit">Confirmer</button></form></div><div class="purge-meta">La suppression ne démarre qu’après une deuxième confirmation explicite.</div>`);
}

function secondPage(nonce) {
  return layout('Confirmation irréversible', `<div class="purge-eyebrow">Dernière confirmation</div><h1>Confirmez-vous vraiment cette action irréversible ?</h1><p>La suppression va commencer immédiatement et aucune donnée locale ne pourra être récupérée par cette plateforme.</p><div class="purge-warning"><strong>Dernier avertissement :</strong> confirmez uniquement si vous voulez repartir avec une base complètement vide.</div><div class="purge-actions"><form method="post"><input type="hidden" name="action" value="cancel"><button class="purge-secondary" type="submit">Non, revenir en arrière</button></form><form method="post"><input type="hidden" name="action" value="reset"><input type="hidden" name="nonce" value="${nonce}"><button class="purge-danger" type="submit">Oui, supprimer définitivement</button></form></div>`);
}

async function resetDatabase() {
  const databasePath = sqlitePath();
  if (!databasePath) throw new Error('DATABASE_URL doit pointer vers une base SQLite persistante.');
  const cli = prismaCliPath();
  if (!cli) throw new Error('Prisma CLI introuvable sur le serveur.');

  await prisma.$disconnect();
  try {
    for (const file of [databasePath, `${databasePath}-wal`, `${databasePath}-shm`]) {
      try { fs.rmSync(file, { force: true }); } catch (error) { throw new Error(`Impossible de supprimer ${file}: ${error.message}`); }
    }
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
  if (!['GET', 'POST'].includes(req.method)) return res.status(405).send(layout('Méthode non autorisée', '<h1>Méthode non autorisée</h1><p>Utilisez cette URL depuis un navigateur.</p>'));

  if (req.method === 'GET') return res.type('html').send(firstPage());
  const action = String(req.body?.action || '');
  if (action === 'cancel') {
    confirmationNonce = null;
    return res.type('html').send(firstPage());
  }
  if (action === 'second_confirm') {
    confirmationNonce = crypto.randomBytes(32).toString('hex');
    confirmationExpiresAt = Date.now() + 5 * 60 * 1000;
    return res.type('html').send(secondPage(confirmationNonce));
  }
  if (action !== 'reset' || !constantTimeEqual(req.body?.nonce, confirmationNonce) || Date.now() > confirmationExpiresAt) {
    return res.type('html').status(400).send(firstPage('La confirmation a expiré. Recommencez la procédure.'));
  }
  confirmationNonce = null;
  confirmationExpiresAt = 0;
  if (purgeInProgress) return res.type('html').status(409).send(firstPage('Une réinitialisation est déjà en cours.'));
  purgeInProgress = true;
  try {
    await resetDatabase();
    return res.type('html').send(layout('Base réinitialisée', '<div class="purge-eyebrow">Opération terminée</div><h1>Base locale réinitialisée</h1><p>La base a été supprimée et son schéma a été recréé. Vous pouvez maintenant retourner à l’application.</p><div class="purge-actions"><a class="purge-danger" href="/">Retourner à l’application</a></div>'));
  } catch (error) {
    console.error('[DB purge] Échec:', error);
    return res.type('html').status(500).send(firstPage('La réinitialisation a échoué. Vérifiez la configuration Prisma et réessayez.'));
  } finally {
    purgeInProgress = false;
  }
});

module.exports = router;
