'use strict';

const assert = require('node:assert/strict');
const { once } = require('node:events');
const express = require('express');
const { test } = require('node:test');

test('reference documents can be uploaded, reviewed, validated, and deleted per profile', async (t) => {
  const routePath = require.resolve('./knowledgeDocumentRoutes');
  const prismaPath = require.resolve('../prisma');
  const authPath = require.resolve('../middleware/auth');
  const documents = [];
  let nextId = 1;
  const fakePrisma = {
    knowledgeDocument: {
      count: async ({ where }) => documents.filter(document => document.profile_id === where.profile_id).length,
      create: async ({ data }) => {
        const document = { id: nextId++, ...data, created_at: new Date(), updated_at: new Date(), validated_at: null };
        documents.push(document);
        return document;
      },
      findMany: async ({ where, select }) => documents
        .filter(document => document.profile_id === where.profile_id && (!where.status || document.status === where.status))
        .filter(document => !where.id?.not || document.id !== where.id.not)
        .map(document => select ? Object.fromEntries(Object.keys(select).map(key => [key, document[key]])) : document),
      findFirst: async ({ where, select }) => {
        const document = documents.find(item => item.id === where.id && item.profile_id === where.profile_id);
        return document && select ? Object.fromEntries(Object.keys(select).map(key => [key, document[key]])) : document || null;
      },
      update: async ({ where, data }) => {
        const document = documents.find(item => item.id === where.id && item.profile_id === where.profile_id);
        if (!document) throw new Error('Document disappeared');
        Object.assign(document, data, { updated_at: new Date() });
        return document;
      },
      deleteMany: async ({ where }) => {
        const index = documents.findIndex(item => item.id === where.id && item.profile_id === where.profile_id);
        if (index < 0) return { count: 0 };
        documents.splice(index, 1);
        return { count: 1 };
      }
    }
  };
  const dependencies = new Map([
    [prismaPath, fakePrisma],
    [authPath, {
      authMiddleware(_req, _res, next) { next(); },
      profileMiddleware(req, _res, next) { req.profileId = 7; next(); }
    }]
  ]);
  const previousModules = new Map();
  for (const [modulePath, exports] of dependencies) {
    previousModules.set(modulePath, require.cache[modulePath]);
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  }

  let server;
  try {
    delete require.cache[routePath];
    const router = require('./knowledgeDocumentRoutes');
    const app = express();
    app.use(express.json());
    app.use('/api/knowledge-documents', router);
    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const baseUrl = `http://127.0.0.1:${server.address().port}/api/knowledge-documents`;

    const form = new FormData();
    form.set('category', 'company');
    form.append('file', new Blob(['NOVALYS vend des produits de soin.']), 'presentation.txt');
    const uploadResponse = await fetch(baseUrl, { method: 'POST', body: form });
    const created = await uploadResponse.json();
    assert.equal(uploadResponse.status, 201);
    assert.equal(created.status, 'pending');
    assert.equal(created.extracted_text, 'NOVALYS vend des produits de soin.');
    assert.equal(created.category, 'company');

    const listResponse = await fetch(baseUrl);
    const list = await listResponse.json();
    assert.equal(listResponse.status, 200);
    assert.equal(list.length, 1);
    assert.equal(Object.hasOwn(list[0], 'extracted_text'), false);

    const detailResponse = await fetch(`${baseUrl}/${created.id}`);
    assert.equal((await detailResponse.json()).extracted_text, created.extracted_text);

    const validationResponse = await fetch(`${baseUrl}/${created.id}/validate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted_text: 'Texte relu et corrigé par l’entreprise.' })
    });
    const validated = await validationResponse.json();
    assert.equal(validationResponse.status, 200);
    assert.equal(validated.status, 'validated');
    assert.equal(validated.extracted_text, 'Texte relu et corrigé par l’entreprise.');
    assert.ok(validated.validated_at);

    const secondForm = new FormData();
    secondForm.set('category', 'catalog');
    secondForm.append('file', new Blob(['Produit de test']), 'catalogue.txt');
    const secondUpload = await fetch(baseUrl, { method: 'POST', body: secondForm });
    const secondDocument = await secondUpload.json();
    assert.equal(secondUpload.status, 201);

    const emptyValidation = await fetch(`${baseUrl}/${secondDocument.id}/validate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted_text: '  ' })
    });
    assert.equal(emptyValidation.status, 400);

    const overLimitValidation = await fetch(`${baseUrl}/${secondDocument.id}/validate`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extracted_text: 'x'.repeat(30000) })
    });
    assert.equal(overLimitValidation.status, 413);

    documents.push({ id: 90, profile_id: 8, file_name: 'secret.txt', extracted_text: 'Autre profil' });
    const foreignDocumentResponse = await fetch(`${baseUrl}/90`);
    assert.equal(foreignDocumentResponse.status, 404);

    const deleteResponse = await fetch(`${baseUrl}/${created.id}`, { method: 'DELETE' });
    assert.equal(deleteResponse.status, 204);
    assert.equal(documents.some(document => document.id === created.id), false);

    const invalidForm = new FormData();
    invalidForm.set('category', 'company');
    invalidForm.append('file', new Blob(['not an image']), 'photo.png');
    const invalidResponse = await fetch(baseUrl, { method: 'POST', body: invalidForm });
    assert.equal(invalidResponse.status, 400);
  } finally {
    if (server?.listening) await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    delete require.cache[routePath];
    for (const [modulePath, previousModule] of previousModules) {
      if (previousModule) require.cache[modulePath] = previousModule;
      else delete require.cache[modulePath];
    }
  }
});
