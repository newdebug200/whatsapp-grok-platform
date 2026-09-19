const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '../../uploads');
const HIGH_WATERMARK = 0.85;
const LOW_WATERMARK = 0.75;

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
  const targetUsed = usage.total * LOW_WATERMARK;
  const required = Math.max(0, usage.used + Number(requiredBytes || 0) - targetUsed);
  if (usage.ratio < HIGH_WATERMARK && required <= 0) return { deleted: 0, bytes: 0 };

  const references = await Promise.all([
    prisma.message.findMany({ where: { media_path: { not: null } }, select: { id: true, media_path: true }, orderBy: { created_at: 'asc' } }),
    prisma.campaignMessage.findMany({ where: { media_path: { not: null } }, select: { id: true, media_path: true }, orderBy: { id: 'asc' } })
  ]);
  const files = references.flat().filter(item => item.media_path).map(item => ({ ...item, filePath: path.join(UPLOADS_DIR, item.media_path) }));
  let reclaimed = 0;
  let deleted = 0;
  for (const item of files) {
    if (required <= 0 && usage.ratio < HIGH_WATERMARK) break;
    let size = 0;
    try { size = fs.statSync(item.filePath).size; } catch (_) {}
    try { if (fs.existsSync(item.filePath)) fs.unlinkSync(item.filePath); } catch (_) { continue; }
    reclaimed += size;
    deleted++;
    await prisma.message.updateMany({ where: { media_path: item.media_path }, data: { media_path: null } }).catch(() => {});
    await prisma.campaignMessage.updateMany({ where: { media_path: item.media_path }, data: { media_path: null } }).catch(() => {});
    if (reclaimed >= required) break;
  }
  return { deleted, bytes: reclaimed };
}

module.exports = { UPLOADS_DIR, ensureUploadsDir, getDiskUsage, ensureCapacity, HIGH_WATERMARK, LOW_WATERMARK };
