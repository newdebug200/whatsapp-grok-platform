'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const { once } = require('node:events');
const express = require('express');
const { test } = require('node:test');
const { handleCampaignUpload } = require('./campaignMediaUpload');

test('campaign upload receives file variants separately from campaign text', async (t) => {
  const app = express();
  let uploadedFilePath;
  app.post('/campaigns', handleCampaignUpload, (req, res) => {
    const campaign = JSON.parse(req.body.campaign);
    uploadedFilePath = req.files[0].path;
    res.json({
      content: campaign.messages[0].content,
      fileField: req.files[0].fieldname,
      filename: req.files[0].originalname,
      fileContent: fs.readFileSync(uploadedFilePath, 'utf8')
    });
  });

  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    if (uploadedFilePath && fs.existsSync(uploadedFilePath)) fs.unlinkSync(uploadedFilePath);
  });

  const form = new FormData();
  form.set('campaign', JSON.stringify({
    name: 'Multipart test',
    messages: [{ content: 'Texte de légende', media_type: 'document', media_file_index: 0 }]
  }));
  form.append('media_0', new Blob(['%PDF-1.4 fixture']), 'piece-jointe.pdf');

  const response = await fetch(`http://127.0.0.1:${server.address().port}/campaigns`, {
    method: 'POST',
    body: form
  });
  const result = await response.json();

  assert.equal(response.status, 200);
  assert.equal(result.content, 'Texte de légende');
  assert.equal(result.fileField, 'media_0');
  assert.equal(result.filename, 'piece-jointe.pdf');
  assert.equal(result.fileContent, '%PDF-1.4 fixture');
});

test('multipart campaign creation preserves its name and can be loaded by id', async (t) => {
  const routePath = require.resolve('../routes/broadcastRoutes');
  const dependencyExports = new Map([
    [require.resolve('../prisma'), {
      contact: {
        findMany: async () => [{ id: 8 }]
      },
      campaign: {
        create: async ({ data }) => {
          storedCampaign = {
            id: 42,
            profile_id: data.profile_id,
            name: data.name,
            status: data.status,
            messages: data.messages.create.map((message, index) => ({
              id: index + 1,
              campaign_id: 42,
              ...message
            })),
            targets: data.targets.create.map((target, index) => ({
              id: index + 1,
              ...target,
              contact: { id: target.contact_id, name: 'Test', phone_number: '+15551234567' }
            }))
          };
          return storedCampaign;
        },
        findFirst: async ({ where }) => (
          storedCampaign?.id === where.id && storedCampaign.profile_id === where.profile_id
            ? storedCampaign
            : null
        )
      }
    }],
    [require.resolve('../middleware/auth'), {
      authMiddleware(_req, _res, next) {
        next();
      },
      profileMiddleware(req, _res, next) {
        req.profileId = 7;
        next();
      }
    }],
    [require.resolve('./whatsappManager'), {}],
    [require.resolve('./campaignLifecycle'), { resetCompletedCampaign: async () => 0 }]
  ]);
  const previousModules = new Map();
  for (const [modulePath, exports] of dependencyExports) {
    previousModules.set(modulePath, require.cache[modulePath]);
    require.cache[modulePath] = { id: modulePath, filename: modulePath, loaded: true, exports };
  }

  let storedCampaign;
  let persistedMediaPath;
  let server;
  try {
    delete require.cache[routePath];
    const campaignRoutes = require('../routes/broadcastRoutes');
    const app = express();
    app.use(express.json({ limit: '10mb' }));
    app.use('/api/broadcast', campaignRoutes);

    server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');

    const form = new FormData();
    form.set('campaign', JSON.stringify({
      name: 'Campagne image avec légende',
      messages: [{ content: 'Bonjour, voici la photo.', media_type: 'image', media_file_index: 0 }],
      contact_ids: [8]
    }));
    form.append('media_0', new Blob(['image fixture'], { type: 'image/png' }), 'photo.png');

    const createdResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/broadcast/campaigns`, {
      method: 'POST',
      body: form
    });
    const createdCampaign = await createdResponse.json();
    persistedMediaPath = storedCampaign?.messages[0]?.media_path;

    assert.equal(createdResponse.status, 200);
    assert.equal(createdCampaign.name, 'Campagne image avec légende');
    assert.equal(createdCampaign.messages[0].content, 'Bonjour, voici la photo.');
    assert.match(createdCampaign.messages[0].media_path, /^campaign_/);
    assert.equal(fs.readFileSync(require('node:path').join(__dirname, '../../uploads', createdCampaign.messages[0].media_path), 'utf8'), 'image fixture');

    const loadedResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/broadcast/campaigns/42`);
    const loadedCampaign = await loadedResponse.json();
    assert.equal(loadedResponse.status, 200);
    assert.equal(loadedCampaign.name, 'Campagne image avec légende');
    assert.equal(loadedCampaign.messages[0].content, 'Bonjour, voici la photo.');
    assert.equal(loadedCampaign.messages[0].media_path, createdCampaign.messages[0].media_path);
  } finally {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    }
    if (persistedMediaPath) {
      const filePath = require('node:path').join(__dirname, '../../uploads', persistedMediaPath);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    delete require.cache[routePath];
    for (const [modulePath, previousModule] of previousModules) {
      if (previousModule) require.cache[modulePath] = previousModule;
      else delete require.cache[modulePath];
    }
  }
});
