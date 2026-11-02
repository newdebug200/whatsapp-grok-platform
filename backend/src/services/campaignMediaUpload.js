'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const uploadsDir = path.join(__dirname, '../../uploads');
const campaignTempDir = path.join(uploadsDir, '.campaign-temp');

const campaignUpload = multer({
  storage: multer.diskStorage({
    destination(_req, _file, callback) {
      fs.mkdir(campaignTempDir, { recursive: true }, error => callback(error, campaignTempDir));
    },
    filename(_req, file, callback) {
      const extension = path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '').slice(0, 12);
      callback(null, `${crypto.randomUUID()}${extension}`);
    }
  }),
  limits: {
    fileSize: 64 * 1024 * 1024,
    files: 20,
    fields: 1,
    fieldSize: 10 * 1024 * 1024
  }
});

function handleCampaignUpload(req, res, next) {
  campaignUpload.any()(req, res, error => {
    if (!error) return next();

    for (const file of req.files || []) {
      try {
        fs.unlinkSync(file.path);
      } catch (cleanupError) {
        if (cleanupError.code !== 'ENOENT') {
          console.error('Erreur nettoyage média temporaire:', cleanupError);
        }
      }
    }

    const tooLarge = error.code === 'LIMIT_FILE_SIZE';
    return res.status(tooLarge ? 413 : 400).json({
      error: tooLarge ? 'Chaque fichier de campagne doit faire 64 Mo maximum' : 'Fichier de campagne invalide'
    });
  });
}

module.exports = { handleCampaignUpload };
