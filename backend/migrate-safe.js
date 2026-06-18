'use strict';
/**
 * migrate-safe.js — Migration SQLite sans perte de données
 * Ajoute les colonnes manquantes via ALTER TABLE (idempotent).
 * Utilisé par demarrer.bat après chaque mise à jour.
 */

const path = require('path');
const fs   = require('fs');

async function main() {
  let PrismaClient;
  try {
    ({ PrismaClient } = require('@prisma/client'));
  } catch (e) {
    console.log('  [migrate] Prisma client absent — lancez prisma generate d\'abord.');
    return;
  }

  const prisma = new PrismaClient({ log: [] });

  const addColumnSafe = async (sql, label) => {
    try {
      await prisma.$executeRawUnsafe(sql);
      console.log('  [migrate] Colonne ajoutee :', label);
    } catch (e) {
      const msg = (e.message || '').toLowerCase();
      if (msg.includes('duplicate column') || msg.includes('already exists')) {
        console.log('  [migrate] Colonne deja presente :', label);
      } else {
        console.log('  [migrate] Avertissement', label, ':', e.message);
      }
    }
  };

  await addColumnSafe(
    'ALTER TABLE "Contact" ADD COLUMN "is_favorite" BOOLEAN NOT NULL DEFAULT 0',
    'Contact.is_favorite'
  );
  await addColumnSafe(
    'ALTER TABLE "Message" ADD COLUMN "media_path" TEXT',
    'Message.media_path'
  );

  await prisma.$disconnect();
  console.log('  [migrate] Migration terminee.');
}

main().catch(e => {
  console.log('  [migrate] Erreur non bloquante :', e.message);
  process.exit(0);
});
