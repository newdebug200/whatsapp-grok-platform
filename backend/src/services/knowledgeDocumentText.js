'use strict';

const { Readable } = require('node:stream');
const path = require('node:path');

const MAX_EXTRACTED_TEXT_CHARS = 200000;
const MAX_PDF_PAGES = 100;
const MAX_WORKSHEETS = 10;
const MAX_ROWS_PER_WORKSHEET = 2000;
const MAX_COLUMNS_PER_ROW = 100;
const MAX_ZIP_UNCOMPRESSED_BYTES = 50 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 5000;
const textLengths = new WeakMap();

const SUPPORTED_EXTENSIONS = new Set(['.pdf', '.docx', '.txt', '.csv', '.xlsx']);

function documentError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

function appendText(lines, value) {
  const line = String(value ?? '').trim();
  if (!line) return;
  const currentLength = textLengths.get(lines) || 0;
  if (currentLength + line.length > MAX_EXTRACTED_TEXT_CHARS) {
    throw documentError(`Le texte extrait dépasse la limite de ${MAX_EXTRACTED_TEXT_CHARS} caractères. Réduisez le document avant de le téléverser.`, 413);
  }
  lines.push(line);
  textLengths.set(lines, currentLength + line.length + 1);
}

function decodeUtf8(buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer).replace(/^\uFEFF/, '');
  } catch {
    throw documentError('Le fichier texte doit être encodé en UTF-8.');
  }
}

function getCellText(value) {
  if (value === null || value === undefined) return '';
  if (typeof value !== 'object') return String(value);
  if (Array.isArray(value.richText)) return value.richText.map(part => part.text || '').join('');
  if (value.text !== undefined) return String(value.text);
  if (value.result !== undefined) return String(value.result);
  if (value.hyperlink) return String(value.text || value.hyperlink);
  return '';
}

function validateOfficeArchive(buffer) {
  const searchStart = Math.max(0, buffer.length - 65557);
  let endOffset = -1;
  for (let offset = buffer.length - 22; offset >= searchStart; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) {
      endOffset = offset;
      break;
    }
  }
  if (endOffset < 0) throw documentError('Le document Office est illisible ou endommagé.');

  const entryCount = buffer.readUInt16LE(endOffset + 10);
  const directorySize = buffer.readUInt32LE(endOffset + 12);
  const directoryOffset = buffer.readUInt32LE(endOffset + 16);
  if (
    entryCount > MAX_ZIP_ENTRIES
    || directoryOffset + directorySize > endOffset
    || directoryOffset + directorySize > buffer.length
  ) {
    throw documentError('Le document Office est invalide ou contient trop de données.', 413);
  }

  let totalUncompressedBytes = 0;
  let offset = directoryOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > buffer.length || buffer.readUInt32LE(offset) !== 0x02014b50) {
      throw documentError('Le document Office est illisible ou endommagé.');
    }
    const flags = buffer.readUInt16LE(offset + 8);
    if (flags & 1) throw documentError('Les documents Office chiffrés ne sont pas pris en charge.');
    const compressedBytes = buffer.readUInt32LE(offset + 20);
    const uncompressedBytes = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    offset += 46 + nameLength + extraLength + commentLength;
    if (offset > buffer.length) throw documentError('Le document Office est illisible ou endommagé.');

    totalUncompressedBytes += uncompressedBytes;
    if (
      totalUncompressedBytes > MAX_ZIP_UNCOMPRESSED_BYTES
      || (compressedBytes > 0 && uncompressedBytes / compressedBytes > 1000)
    ) {
      throw documentError('Le document Office contient trop de données compressées. Réduisez le fichier avant de le téléverser.', 413);
    }
  }
}

function appendWorksheet(lines, worksheet) {
  appendText(lines, `Feuille : ${worksheet.name}`);
  if (worksheet.rowCount > MAX_ROWS_PER_WORKSHEET) {
    throw documentError(`Une feuille dépasse la limite de ${MAX_ROWS_PER_WORKSHEET} lignes. Réduisez le document avant de le téléverser.`, 413);
  }
  let rowCount = 0;
  worksheet.eachRow({ includeEmpty: false }, row => {
    rowCount += 1;
    if (rowCount > MAX_ROWS_PER_WORKSHEET) {
      throw documentError(`Une feuille dépasse la limite de ${MAX_ROWS_PER_WORKSHEET} lignes. Réduisez le document avant de le téléverser.`, 413);
    }
    const values = row.values.slice(1, MAX_COLUMNS_PER_ROW + 1).map(getCellText);
    appendText(lines, values.join(' | '));
  });
}

async function extractPdfText(buffer) {
  if (buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw documentError('Le contenu du fichier ne semble pas être un PDF valide.');
  }

  try {
    const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
    const loadingTask = pdfjs.getDocument({
      data: new Uint8Array(buffer),
      isEvalSupported: false,
      useSystemFonts: true
    });
    let document;
    try {
      document = await loadingTask.promise;
      if (document.numPages > MAX_PDF_PAGES) {
        throw documentError(`Le PDF dépasse la limite de ${MAX_PDF_PAGES} pages.`, 413);
      }
      const lines = [];
      for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
        const page = await document.getPage(pageNumber);
        const content = await page.getTextContent();
        appendText(lines, content.items.map(item => item.str || '').join(' '));
        page.cleanup();
      }
      return lines.join('\n');
    } finally {
      if (document) await document.destroy();
      else await loadingTask.destroy();
    }
  } catch (error) {
    if (error.statusCode) throw error;
    throw documentError('Le PDF est illisible ou endommagé. Vérifiez le fichier et réessayez.', 422);
  }
}

async function extractWordText(buffer) {
  if (buffer.subarray(0, 2).toString('ascii') !== 'PK') {
    throw documentError('Le contenu du fichier ne semble pas être un document DOCX valide.');
  }
  validateOfficeArchive(buffer);
  try {
    const mammoth = require('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = result.value.trim();
    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw documentError(`Le texte extrait dépasse la limite de ${MAX_EXTRACTED_TEXT_CHARS} caractères. Réduisez le document avant de le téléverser.`, 413);
    }
    return text;
  } catch (error) {
    if (error.statusCode) throw error;
    throw documentError('Le document DOCX est illisible ou endommagé. Vérifiez le fichier et réessayez.', 422);
  }
}

async function extractSpreadsheetText(buffer, extension) {
  if (extension === '.xlsx' && buffer.subarray(0, 2).toString('ascii') !== 'PK') {
    throw documentError('Le contenu du fichier ne semble pas être un classeur XLSX valide.');
  }
  if (extension === '.xlsx') validateOfficeArchive(buffer);
  try {
    const ExcelJS = require('exceljs');
    const workbook = new ExcelJS.Workbook();
    if (extension === '.xlsx') {
      await workbook.xlsx.load(buffer);
    } else {
      await workbook.csv.read(Readable.from([buffer]));
    }
    if (workbook.worksheets.length > MAX_WORKSHEETS) {
      throw documentError(`Le classeur dépasse la limite de ${MAX_WORKSHEETS} feuilles.`, 413);
    }
    const lines = [];
    for (const worksheet of workbook.worksheets) appendWorksheet(lines, worksheet);
    return lines.join('\n');
  } catch (error) {
    if (error.statusCode) throw error;
    throw documentError('Le fichier tabulaire est illisible ou endommagé. Vérifiez le fichier et réessayez.', 422);
  }
}

async function extractDocumentText(buffer, fileName) {
  const extension = path.extname(String(fileName || '')).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(extension)) {
    throw documentError('Format non pris en charge. Ajoutez un fichier PDF, DOCX, TXT, CSV ou XLSX.');
  }
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw documentError('Le fichier est vide ou invalide.');
  }

  let text;
  if (extension === '.pdf') {
    text = await extractPdfText(buffer);
  } else if (extension === '.docx') {
    text = await extractWordText(buffer);
  } else if (extension === '.xlsx' || extension === '.csv') {
    if (extension === '.csv' && buffer.includes(0)) throw documentError('Le fichier CSV contient des données binaires.');
    text = await extractSpreadsheetText(buffer, extension);
  } else {
    if (buffer.includes(0)) throw documentError('Le fichier TXT contient des données binaires.');
    text = decodeUtf8(buffer).trim();
    if (text.length > MAX_EXTRACTED_TEXT_CHARS) {
      throw documentError(`Le texte extrait dépasse la limite de ${MAX_EXTRACTED_TEXT_CHARS} caractères. Réduisez le document avant de le téléverser.`, 413);
    }
  }

  if (!text.trim()) {
    throw documentError('Aucun texte lisible n’a été trouvé. Vérifiez le fichier : les PDF scannés sans texte ne sont pas encore pris en charge.');
  }
  return text;
}

module.exports = {
  extractDocumentText,
  MAX_EXTRACTED_TEXT_CHARS,
  SUPPORTED_EXTENSIONS
};
