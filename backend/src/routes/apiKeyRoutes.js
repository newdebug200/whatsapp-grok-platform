const express = require('express');
const crypto = require('crypto');
const prisma = require('../prisma');
const { authMiddleware } = require('../middleware/auth');
const centralSync = require('../services/centralSync');

const router = express.Router();
router.use(authMiddleware);

function createRawKey() {
  return `btr_live_${crypto.randomBytes(32).toString('base64url')}`;
}

router.get('/', async (req, res) => {
  const keys = await prisma.apiKey.findMany({ where: { account_id: req.accountId }, orderBy: { created_at: 'desc' }, select: { id: true, name: true, prefix: true, last_used_at: true, revoked_at: true, created_at: true } });
  res.json(keys);
});

router.post('/', async (req, res) => {
  const name = String(req.body?.name || '').trim().slice(0, 80);
  if (!name) return res.status(400).json({ error: 'Le nom de la clé API est requis.' });
  const activeCount = await prisma.apiKey.count({ where: { account_id: req.accountId, revoked_at: null } });
  if (activeCount >= 10) return res.status(400).json({ error: 'La limite de 10 clés API actives est atteinte.' });
  const rawKey = createRawKey();
  const created = await prisma.apiKey.create({ data: { account_id: req.accountId, name, prefix: rawKey.slice(0, 18), key_hash: crypto.createHash('sha256').update(rawKey).digest('hex') }, select: { id: true, key_uid: true, name: true, prefix: true, created_at: true } });
  centralSync.syncApiKeyEvent(req.accountId, created, 'created').catch(() => {});
  res.status(201).json({ ...created, key: rawKey, warning: 'Copiez cette clé maintenant. Elle ne sera plus affichée ensuite.' });
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'Identifiant de clé invalide.' });
  const key = await prisma.apiKey.findFirst({ where: { id, account_id: req.accountId, revoked_at: null } });
  if (!key) return res.status(404).json({ error: 'Clé API introuvable.' });
  const revokedAt = new Date();
  await prisma.apiKey.update({ where: { id }, data: { revoked_at: revokedAt } });
  centralSync.syncApiKeyEvent(req.accountId, { key_uid: key.key_uid, name: key.name, prefix: key.prefix }, 'revoked').catch(() => {});
  res.json({ success: true, status: 'revoked' });
});

module.exports = router;
