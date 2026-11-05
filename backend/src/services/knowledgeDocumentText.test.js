'use strict';

const assert = require('node:assert/strict');
const { deflateRawSync } = require('node:zlib');
const ExcelJS = require('exceljs');
const { test } = require('node:test');
const { extractDocumentText } = require('./knowledgeDocumentText');

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZip(entries) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [fileName, contents] of Object.entries(entries)) {
    const name = Buffer.from(fileName);
    const data = Buffer.from(contents);
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    localParts.push(local, name, compressed);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(compressed.length, 20);
    central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centralParts.push(central, name);
    offset += local.length + name.length + compressed.length;
  }

  const centralDirectory = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(entries).length, 8);
  end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralDirectory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...localParts, centralDirectory, end]);
}

function createPdf(text) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(`BT /F1 18 Tf 72 720 Td (${text}) Tj ET`, 'ascii')} >>\nstream\nBT /F1 18 Tf 72 720 Td (${text}) Tj ET\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  for (let index = 0; index < objects.length; index += 1) {
    offsets.push(Buffer.byteLength(pdf, 'ascii'));
    pdf += `${index + 1} 0 obj\n${objects[index]}\nendobj\n`;
  }
  const xrefOffset = Buffer.byteLength(pdf, 'ascii');
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return Buffer.from(pdf);
}

test('extracts UTF-8 text and removes its BOM', async () => {
  const text = await extractDocumentText(Buffer.from('\uFEFFPrésentation NOVALYS', 'utf8'), 'presentation.txt');
  assert.equal(text, 'Présentation NOVALYS');
});

test('extracts delimited rows from a CSV file', async () => {
  const text = await extractDocumentText(Buffer.from('Produit,Prix\nSavon,12.50\n'), 'catalogue.csv');
  assert.match(text, /Produit \| Prix/);
  assert.match(text, /Savon \| 12\.5/);
});

test('extracts worksheet rows from an XLSX workbook', async () => {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('Tarifs');
  worksheet.addRows([['Produit', 'Prix'], ['Savon', 12.5]]);
  const buffer = Buffer.from(await workbook.xlsx.writeBuffer());

  const text = await extractDocumentText(buffer, 'tarifs.xlsx');
  assert.match(text, /Feuille : Tarifs/);
  assert.match(text, /Savon \| 12\.5/);
});

test('extracts raw text from a DOCX document', async () => {
  const buffer = createZip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    'word/document.xml': '<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Conditions de vente</w:t></w:r></w:p></w:body></w:document>'
  });

  assert.equal(await extractDocumentText(buffer, 'conditions.docx'), 'Conditions de vente');
});

test('extracts selectable text from a PDF', async () => {
  const text = await extractDocumentText(createPdf('Horaires lundi samedi'), 'horaires.pdf');
  assert.match(text, /Horaires lundi samedi/);
});

test('asks the business to replace scanned PDFs when no selectable text exists', async () => {
  await assert.rejects(
    extractDocumentText(createPdf(''), 'scan.pdf'),
    /PDF scannés sans texte ne sont pas encore pris en charge/
  );
});

test('rejects unsupported, invalid, empty, and oversized text files', async () => {
  await assert.rejects(extractDocumentText(Buffer.from('x'), 'image.png'), /Format non pris en charge/);
  await assert.rejects(extractDocumentText(Buffer.from(''), 'vide.txt'), /vide ou invalide/);
  await assert.rejects(extractDocumentText(Buffer.from([0, 1]), 'binaire.txt'), /données binaires/);
  assert.equal((await extractDocumentText(Buffer.alloc(30001, 97), 'long-mais-valide.txt')).length, 30001);
  await assert.rejects(extractDocumentText(Buffer.alloc(200001, 97), 'long.txt'), /dépasse la limite/);
});
