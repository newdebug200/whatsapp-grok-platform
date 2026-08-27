const express = require('express');
const axios = require('axios');
const router = express.Router();
const prisma = require('../prisma');
const { authMiddleware, adminMiddleware } = require('../middleware/auth');

const ADMIN_API = (process.env.BOTORA_ADMIN_API_URL || 'https://botora.bluelifetech.site').replace(/\/$/, '');
const SERVICE_KEY = process.env.BOTORA_ADMIN_SERVICE_KEY || process.env.BOTORA_SERVICE_KEY || process.env.BOTORA_API_KEY || '';

async function adminRequest(method, path, data, params) {
  if (!SERVICE_KEY) throw new Error('BOTORA_ADMIN_SERVICE_KEY non configurée');
  const response = await axios({ method, url: `${ADMIN_API}/${path.replace(/^\//, '')}`, data, params, headers: { 'X-Botora-Service-Key': SERVICE_KEY, 'Content-Type': 'application/json' }, timeout: 25000 });
  return response.data;
}

router.use(authMiddleware, adminMiddleware);
router.get('/overview', async (_req, res) => { try { res.json(await adminRequest('GET', '/api/admin.php', null, { resource: 'overview' })); } catch (e) { res.status(502).json({ error: 'API admin indisponible' }); } });
router.get('/activities', async (req, res) => { try { res.json(await adminRequest('GET', '/api/admin.php', null, { resource: 'activities', limit: req.query.limit || 100 })); } catch (e) { res.status(502).json({ error: 'Activités indisponibles' }); } });
router.get('/users', async (req, res) => { try { res.json(await adminRequest('GET', '/api/admin.php', null, { resource: 'users', q: req.query.q || '' })); } catch (e) { res.status(502).json({ error: 'Utilisateurs indisponibles' }); } });
router.patch('/users/:id', async (req, res) => { try { const user = await prisma.account.findUnique({ where: { id: Number(req.params.id) }, select: { email: true } }); res.json(await adminRequest('PATCH', '/api/admin.php?resource=user', { ...req.body, email: user?.email })); } catch (e) { res.status(502).json({ error: 'Modification utilisateur impossible' }); } });
router.get('/credits', async (req, res) => { try { res.json(await adminRequest('GET', '/api/admin.php', null, { resource: 'credits', email: req.query.email || '' })); } catch (e) { res.status(502).json({ error: 'Crédits indisponibles' }); } });
router.post('/credits', async (req, res) => { try { res.json(await adminRequest('POST', '/api/admin.php?resource=credits', req.body)); } catch (e) { res.status(502).json({ error: 'Modification des crédits impossible' }); } });
router.get('/plans', async (_req, res) => { try { res.json(await adminRequest('GET', '/api/admin.php', null, { resource: 'plans' })); } catch (e) { res.status(502).json({ error: 'Abonnements indisponibles' }); } });
router.post('/plans', async (req, res) => { try { res.json(await adminRequest('POST', '/api/admin.php?resource=plans', req.body)); } catch (e) { res.status(502).json({ error: 'Création de l’abonnement impossible' }); } });
router.patch('/plans/:id', async (req, res) => { try { res.json(await adminRequest('PATCH', '/api/admin.php?resource=plans', { ...req.body, id: Number(req.params.id) })); } catch (e) { res.status(502).json({ error: 'Modification de l’abonnement impossible' }); } });
router.delete('/plans/:id', async (req, res) => { try { res.json(await adminRequest('DELETE', `/api/admin.php?resource=plans&id=${Number(req.params.id)}`)); } catch (e) { res.status(502).json({ error: 'Suppression de l’abonnement impossible' }); } });
router.get('/features', async (_req, res) => { try { res.json(await adminRequest('GET', '/api/admin.php', null, { resource: 'features' })); } catch (e) { res.status(502).json({ error: 'Fonctionnalités indisponibles' }); } });
router.put('/features', async (req, res) => { try { res.json(await adminRequest('PUT', '/api/admin.php?resource=features', req.body)); } catch (e) { res.status(502).json({ error: 'Modification des fonctionnalités impossible' }); } });
router.post('/telemetry', async (req, res) => { try { res.json(await adminRequest('POST', '/api/telemetry.php', { ...req.body, email: req.body.email || req.user?.email })); } catch (e) { res.status(502).json({ error: 'Remontée d’activité impossible' }); } });
module.exports = router;
