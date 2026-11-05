'use strict';

const express = require('express');
const multer = require('multer');
const path = require('node:path');
const prisma = require('../prisma');
const { authMiddleware, profileMiddleware } = require('../middleware/auth');
const { extractDocumentText, MAX_EXTRACTED_TEXT_CHARS } = require('../services/knowledgeDocumentText');

const router = express.Router();
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const MAX_DOCUMENTS_PER_PROFILE = 20;
const MAX_VALIDATED_TEXT_CHARS = 30000;
const CATEGORIES = new Set(['company', 'catalog', 'pricing', 'policies', 'support', 'faq', 'other']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE, files: 1, fields: 1, fieldSize: 100 }
});

router.use(authMiddleware);
router.use(profileMiddleware);

function handleUpload(req, res, next) {
  upload.single('file')(req, res, error => {
    if (!error) return next();
    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    const tooManyFiles = error.code === 'LIMIT_FILE_COUNT';
    res.status(tooLarge ? 413 : 400).json({
      error: tooLarge
        ? 'Le fichier ne doit pas dépasser 10 Mo.'
        : tooManyFiles
          ? 'Téléversez un seul document à la fois.'
          : 'Le fichier n’a pas pu être téléversé.'
    });
  });
}

router.get('/', async (req, res) => {
  try {
    const documents = await prisma.knowledgeDocument.findMany({
      where: { profile_id: req.profileId },
      orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
      select: {
        id: true,
        file_name: true,
        category: true,
        mime_type: true,
        file_size: true,
        status: true,
        validated_at: true,
        created_at: true,
        updated_at: true
      }
    });
    res.json(documents);
  } catch (error) {
    console.error('Erreur liste documents de référence:', error);
    res.status(500).json({ error: 'Impossible de charger les documents de référence.' });
  }
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Document invalide.' });
  try {
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id, profile_id: req.profileId }
    });
    if (!document) return res.status(404).json({ error: 'Document introuvable.' });
    res.json(document);
  } catch (error) {
    console.error('Erreur lecture document de référence:', error);
    res.status(500).json({ error: 'Impossible de charger ce document.' });
  }
});

router.post('/', handleUpload, async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Sélectionnez un document à téléverser.' });

  const category = String(req.body.category || 'other');
  if (!CATEGORIES.has(category)) return res.status(400).json({ error: 'Catégorie de document invalide.' });

  const extension = path.extname(req.file.originalname).toLowerCase();
  const fileName = path.basename(req.file.originalname.replace(/[\\/]/g, '/')).replace(/[\u0000-\u001f\u007f]/g, '').slice(0, 180);
  if (!fileName || fileName.startsWith('.')) return res.status(400).json({ error: 'Nom de fichier invalide.' });

  try {
    const documentCount = await prisma.knowledgeDocument.count({ where: { profile_id: req.profileId } });
    if (documentCount >= MAX_DOCUMENTS_PER_PROFILE) {
      return res.status(413).json({ error: `Un profil peut contenir au maximum ${MAX_DOCUMENTS_PER_PROFILE} documents.` });
    }

    const extractedText = await extractDocumentText(req.file.buffer, fileName);
    const document = await prisma.knowledgeDocument.create({
      data: {
        profile_id: req.profileId,
        file_name: fileName,
        category,
        mime_type: req.file.mimetype || 'application/octet-stream',
        file_size: req.file.size,
        extracted_text: extractedText,
        status: 'pending'
      }
    });
    res.status(201).json(document);
  } catch (error) {
    const statusCode = error.statusCode || 500;
    if (statusCode >= 500) console.error('Erreur ajout document de référence:', error);
    res.status(statusCode).json({
      error: statusCode >= 500
        ? 'Impossible de traiter ce document pour le moment.'
        : error.message
    });
  }
});

router.put('/:id/validate', async (req, res) => {
  const id = Number(req.params.id);
  const extractedText = typeof req.body?.extracted_text === 'string' ? req.body.extracted_text.trim() : '';
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Document invalide.' });
  if (!extractedText) return res.status(400).json({ error: 'Le texte à valider ne peut pas être vide.' });
  if (extractedText.length > MAX_EXTRACTED_TEXT_CHARS) {
    return res.status(413).json({ error: `Le texte ne peut pas dépasser ${MAX_EXTRACTED_TEXT_CHARS} caractères.` });
  }

  try {
    const document = await prisma.knowledgeDocument.findFirst({
      where: { id, profile_id: req.profileId },
      select: { id: true }
    });
    if (!document) return res.status(404).json({ error: 'Document introuvable.' });

    const validatedDocuments = await prisma.knowledgeDocument.findMany({
      where: { profile_id: req.profileId, status: 'validated', id: { not: id } },
      select: { extracted_text: true }
    });
    const validatedTextLength = validatedDocuments.reduce((total, item) => total + item.extracted_text.length, 0);
    if (validatedTextLength + extractedText.length > MAX_VALIDATED_TEXT_CHARS) {
      return res.status(413).json({
        error: `Les documents validés ne peuvent pas dépasser ${MAX_VALIDATED_TEXT_CHARS} caractères au total. Supprimez ou raccourcissez un document.`
      });
    }

    const updatedDocument = await prisma.knowledgeDocument.update({
      where: { id, profile_id: req.profileId },
      data: { extracted_text: extractedText, status: 'validated', validated_at: new Date() }
    });
    res.json(updatedDocument);
  } catch (error) {
    console.error('Erreur validation document de référence:', error);
    res.status(500).json({ error: 'Impossible de valider ce document.' });
  }
});

router.delete('/:id', async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isSafeInteger(id) || id < 1) return res.status(400).json({ error: 'Document invalide.' });
  try {
    const deleted = await prisma.knowledgeDocument.deleteMany({
      where: { id, profile_id: req.profileId }
    });
    if (deleted.count === 0) return res.status(404).json({ error: 'Document introuvable.' });
    res.status(204).end();
  } catch (error) {
    console.error('Erreur suppression document de référence:', error);
    res.status(500).json({ error: 'Impossible de supprimer ce document.' });
  }
});

module.exports = router;
