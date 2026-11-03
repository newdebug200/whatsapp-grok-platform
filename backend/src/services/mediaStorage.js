const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');

function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
}

function getDiskUsage() {
  const stats = fs.statfsSync(ensureUploadsDir());
  const total = Number(stats.blocks) * Number(stats.bsize);
  const free = Number(stats.bfree) * Number(stats.bsize);
  return { total, free, used: Math.max(0, total - free), ratio: total > 0 ? (total - free) / total : 0 };
}

async function ensureCapacity(prisma, requiredBytes = 0) {
  const usage = getDiskUsage();
  const required = Math.max(0, Number(requiredBytes) || 0);
  if (required > usage.free) {
    const error = new Error(`Espace disque insuffisant pour archiver le média (${required} octets requis, ${usage.free} disponibles)`);
    error.code = 'ENOSPC';
    error.requiredBytes = required;
    error.availableBytes = usage.free;
    throw error;
  }
  return { deleted: 0, bytes: 0 };
}

function isViewOnceMessage(message) {
  const data = message?._data;
  return [
    message?.isViewOnce,
    message?.viewOnce,
    message?.isViewOnceV2,
    message?.isViewOnceV2Extension,
    data?.isViewOnce,
    data?.viewOnce,
    data?.isViewOnceV2,
    data?.isViewOnceV2Extension,
    data?.mediaData?.isViewOnce
  ].some(value => value === true);
}

function getWhatsAppMessageId(message) {
  const id = message?.id || message?._data?.id;
  if (typeof id === 'string') return id;
  if (typeof id?._serialized === 'string') return id._serialized;
  return null;
}

function findMatchingWhatsAppMediaMessage(messages, { type, createdAt, fromMe = false }) {
  const targetTime = new Date(createdAt).getTime();
  if (!Number.isFinite(targetTime)) return null;

  return messages
    .filter(message => message?.hasMedia && Boolean(message.fromMe) === fromMe && message.type === type)
    .map(message => ({
      message,
      delta: Math.abs(Number(message.timestamp) * 1000 - targetTime)
    }))
    .filter(item => Number.isFinite(item.delta) && item.delta <= 2 * 60 * 1000)
    .sort((a, b) => a.delta - b.delta)[0]?.message || null;
}

function getMediaExtension(filename, mimeType) {
  const extension = path.extname(String(filename || '')).slice(1).toLowerCase();
  if (/^[a-z0-9]{1,10}$/.test(extension)) return extension;

  const extensionsByMime = {
    'image/jpeg': 'jpg',
    'image/svg+xml': 'svg',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'ogg',
    'audio/mp4': 'm4a',
    'video/quicktime': 'mov',
    'application/pdf': 'pdf',
    'application/zip': 'zip',
    'text/plain': 'txt',
    'text/csv': 'csv'
  };
  if (extensionsByMime[mimeType]) return extensionsByMime[mimeType];
  const subtype = String(mimeType || '').split('/')[1]?.split(';')[0]?.toLowerCase();
  return subtype && /^[a-z0-9]{1,10}$/.test(subtype) ? subtype : 'bin';
}

async function persistWhatsAppMedia(message, prisma, options = {}) {
  if (!message?.hasMedia || isViewOnceMessage(message)) return null;
  if (message.isEphemeral === true || message._data?.isEphemeral === true) return null;

  const delay = options.delayFn || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let media;
  let downloadError;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      media = await message.downloadMedia();
    } catch (error) {
      downloadError = error;
    }
    if (media?.data) break;
    if (attempt < 2) await delay(350 * (attempt + 1));
  }
  if (!media?.data) {
    if (downloadError) throw downloadError;
    return null;
  }

  const uploadsDir = options.uploadsDir || ensureUploadsDir();
  const ensureCapacityFn = options.ensureCapacityFn || ensureCapacity;
  const buffer = Buffer.from(media.data, 'base64');
  if (buffer.length === 0) return null;

  await ensureCapacityFn(prisma, buffer.length);
  fs.mkdirSync(uploadsDir, { recursive: true });

  const mimeType = String(media.mimetype || message._data?.mimetype || 'application/octet-stream').split(';')[0].trim();
  const extension = getMediaExtension(media.filename || message._data?.filename, mimeType);
  const filename = `received_${Date.now()}_${crypto.randomBytes(8).toString('hex')}.${extension}`;
  const safeOriginalName = String(media.filename || message._data?.filename || `whatsapp_${message.type || 'file'}`)
    .replace(/[^\w. -]/g, '_')
    .slice(0, 180);
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, buffer, { flag: 'wx' });
  return { media_path: filename, media_filename: safeOriginalName, media_mime: mimeType };
}

function deleteStoredMedia(filename, uploadsDir = UPLOADS_DIR) {
  if (!filename || filename === '.' || filename === '..' || path.basename(filename) !== filename || !/^[\w.-]+$/.test(filename)) {
    throw new Error('Nom de fichier média invalide');
  }
  try {
    fs.unlinkSync(path.join(uploadsDir, filename));
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
}

module.exports = {
  UPLOADS_DIR,
  ensureUploadsDir,
  getDiskUsage,
  ensureCapacity,
  persistWhatsAppMedia,
  isViewOnceMessage,
  getWhatsAppMessageId,
  findMatchingWhatsAppMediaMessage,
  deleteStoredMedia
};
