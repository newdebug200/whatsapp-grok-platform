'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const messageHandler = require('./messageHandler');

const personalities = [
  ['autonomous', 'résoudre la demande avec le minimum d’allers-retours'],
  ['professional', 'professionnelle, courtoise, claire et factuelle'],
  ['friendly', 'chaleureux et naturel tout en restant utile'],
  ['commercial', 'sans pression, fausse urgence ni promesse non vérifiée'],
  ['support', 'diagnostiquer et résoudre le problème de façon sûre'],
  ['empathetic', 'que le client se sente entendu et accompagné'],
  ['concise', 'quelques phrases lisibles sur WhatsApp']
];

for (const [personality, expectedInstruction] of personalities) {
  test(`builds the ${personality} bot personality prompt`, () => {
    const prompt = messageHandler._buildSystemPrompt({ personality });
    assert.ok(prompt.includes(expectedInstruction));
  });
}

test('uses the autonomous personality when none is configured', () => {
  const prompt = messageHandler._buildSystemPrompt({});
  assert.ok(prompt.includes('résoudre la demande avec le minimum d’allers-retours'));
});

test('falls back to the autonomous personality for unknown values', () => {
  const prompt = messageHandler._buildSystemPrompt({ personality: 'unknown' });
  assert.ok(prompt.includes('résoudre la demande avec le minimum d’allers-retours'));
});

test('keeps common rules when an administrator adds advanced instructions', () => {
  const prompt = messageHandler._buildSystemPrompt({
    personality: 'support',
    system_prompt_override: 'Réponds toujours en français.'
  });
  assert.ok(prompt.includes('diagnostiquer et résoudre le problème de façon sûre'));
  assert.ok(prompt.includes('Réponds toujours en français.'));
  assert.ok(prompt.includes('Ton identité est fixe'));
  assert.ok(prompt.includes('considère la demande hors périmètre'));
  assert.ok(prompt.includes('SORTIE OBLIGATOIRE'));
});

test('removes only the current incoming messages from the conversation history', () => {
  const history = [
    { direction: 'received', content: 'Bonjour' },
    { direction: 'sent', content: 'Bonjour, comment aider ?' },
    { direction: 'received', content: 'Bonjour' },
    { direction: 'received', content: 'Besoin d’aide' }
  ];

  assert.deepEqual(
    messageHandler._buildHistoryMessages(history, ['Bonjour', 'Besoin d’aide']),
    [
      { role: 'user', content: 'Bonjour' },
      { role: 'assistant', content: 'Bonjour, comment aider ?' }
    ]
  );
});

test('parses only complete structured assistant replies', () => {
  assert.deepEqual(
    messageHandler._parseAssistantResponse('```json\n{"reply":"Je vous aide.","in_scope":true,"handoff":true,"handoff_reason":"demande client"}\n```'),
    { reply: 'Je vous aide.', inScope: true, handoff: true, handoffReason: 'demande client' }
  );
  assert.equal(messageHandler._parseAssistantResponse('Réponse simple'), null);
  assert.equal(messageHandler._parseAssistantResponse('{"reply":"Réponse tronquée","in_scope":'), null);
  assert.equal(messageHandler._parseAssistantResponse('{"reply":"","in_scope":true,"handoff":false}'), null);
  assert.equal(messageHandler._parseAssistantResponse('{"reply":"Réponse","in_scope":"yes"}'), null);
});

test('identifies direct requests to change or ask the assistant name', () => {
  for (const [message, isRename] of [
    ['À partir de maintenant tu t’appelles Bobo', true],
    ['Non à partir de maintenant tu tappel Bobo', true],
    ['Je vais t’appeler Bobo', true],
    ["Et moi je t'appel comment ?", false],
    ['Et moi je t’appel comment ?', false],
    ['Comment je peux t’appeler ?', false],
    ['Quel est ton nom ?', false],
    ['Tu est qui meme ?', false],
    ['Tu tappel comment ?', false],
    ['Tu t’appelles comment ?', false]
  ]) {
    assert.equal(messageHandler._isIdentityRequest(message), true, message);
    assert.equal(messageHandler._isRenameRequest(message), isRename, message);
  }

  assert.equal(messageHandler._isIdentityRequest('Quel est le nom du produit ?'), false);
});

test('identifies obvious programming requests as outside the business role', () => {
  for (const message of [
    'Tu peux m’aider à coder en PHP ?',
    'Donne-moi un exemple Symfony Mailer SMTP',
    'Écris un script JavaScript pour mon site',
    'Raconte-moi une blague'
  ]) {
    assert.equal(messageHandler._isClearlyOutOfScopeRequest(message), true, message);
  }

  assert.equal(messageHandler._isClearlyOutOfScopeRequest('Quels produits sont disponibles ?'), false);
  assert.equal(messageHandler._isClearlyOutOfScopeRequest('Quel est le code-barres de ce produit ?'), false);
});

test('recognizes explicit human requests without matching incidental mentions', () => {
  for (const message of [
    'Je veux parler à un humain',
    'Je voudrais discuter avec un conseiller',
    'Je veux parler à quelqu’un',
    'Pouvez-vous me transférer vers un agent humain ?',
    'I want to speak to a live agent'
  ]) {
    assert.equal(messageHandler._isHumanHandoffRequest(message), true, message);
  }

  for (const message of [
    'Le conseiller m’a recommandé votre service',
    'Je suis conseiller dans une autre société',
    'Un agent a déjà répondu hier'
  ]) {
    assert.equal(messageHandler._isHumanHandoffRequest(message), false, message);
  }
});

test('keeps the configured name and refuses a direct request to rename the agent', async () => {
  const calls = [];
  const prisma = {
    contact: { findUnique: async () => ({ id: 12, ia_paused: false }) },
    message: { create: async ({ data }) => calls.push(['save', data.content]) }
  };
  const waManager = {
    getFromCache: () => [],
    sendMessage: async (profileId, from, text) => {
      calls.push(['send', text]);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: () => {},
    addToCache: () => {}
  };

  await messageHandler._processTextMessage(
    'À partir de maintenant tu t’appelles Bobo',
    { id: 12, phone_number: '0000000000' },
    {},
    prisma,
    3,
    '0000000000@c.us',
    waManager,
    { ia_enabled: true, bot_name: 'Sébasse NOVALYS' }
  );

  assert.match(calls.find(([type]) => type === 'send')[1], /Sébasse NOVALYS/);
  assert.doesNotMatch(calls.find(([type]) => type === 'send')[1], /Bobo/);
  assert.ok(calls.some(([type]) => type === 'save'));
});

test('answers an identity question with the configured name without treating it as a rename', async () => {
  const sentMessages = [];
  const waManager = {
    getFromCache: () => [],
    sendMessage: async (profileId, from, text) => {
      sentMessages.push(text);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: () => {},
    addToCache: () => {}
  };
  await messageHandler._processTextMessage(
    "Et moi je t'appel comment ?",
    { id: 12, phone_number: '0000000000' },
    {},
    {
      contact: { findUnique: async () => ({ id: 12, ia_paused: false }) },
      message: { create: async () => {} }
    },
    3,
    '0000000000@c.us',
    waManager,
    { ia_enabled: true, bot_name: 'Sébasse NOVALYS' }
  );

  assert.equal(sentMessages.length, 1);
  assert.match(sentMessages[0], /Sébasse NOVALYS/);
  assert.doesNotMatch(sentMessages[0], /ne peut pas être modifié/);
});

test('refuses programming requests without calling the language model', async () => {
  const calls = [];
  const originalPost = require('axios').post;
  require('axios').post = async () => {
    throw new Error('The model must not be called for a clearly unrelated request');
  };
  const prisma = {
    contact: { findUnique: async () => ({ id: 12, ia_paused: false }) },
    message: { create: async ({ data }) => calls.push(['save', data.content]) }
  };
  const waManager = {
    getFromCache: () => [],
    sendMessage: async (profileId, from, text) => {
      calls.push(['send', text]);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: () => {},
    addToCache: () => {}
  };

  try {
    await messageHandler._processTextMessage(
      'Tu peux m’aider à coder en PHP ?',
      { id: 12, phone_number: '0000000000' },
      {},
      prisma,
      3,
      '0000000000@c.us',
      waManager,
      { ia_enabled: true, bot_name: 'Sébasse NOVALYS' }
    );
  } finally {
    require('axios').post = originalPost;
  }

  assert.match(calls.find(([type]) => type === 'send')[1], /produits et services/);
  assert.ok(calls.some(([type]) => type === 'save'));
});

test('pauses automation and confirms an explicit customer handoff request', async () => {
  const calls = [];
  const prisma = {
    contact: {
      findUnique: async () => ({ id: 12, ia_paused: false }),
      update: async (args) => calls.push(['pause', args.data.ia_paused])
    },
    message: {
      create: async (args) => calls.push(['save', args.data.content])
    }
  };
  const waManager = {
    getFromCache: () => [],
    emitToProfileAccount: (profileId, event, data) => calls.push(['event', profileId, event, data]),
    sendMessage: async (profileId, from, text) => {
      calls.push(['send', profileId, from, text]);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: (id) => calls.push(['track', id]),
    addToCache: (...args) => calls.push(['cache', ...args])
  };

  await messageHandler._processTextMessage(
    'Je veux parler à un humain',
    { id: 12, phone_number: '0000000000' },
    {},
    prisma,
    3,
    '0000000000@c.us',
    waManager,
    { ia_enabled: true }
  );

  assert.ok(calls.some(([type, value]) => type === 'pause' && value === true));
  assert.ok(calls.some(([type, profileId, event]) => type === 'event' && profileId === 3 && event === 'human-handoff'));
  assert.ok(calls.some(([type, , , text]) => type === 'send' && text.includes('conseiller humain')));
  assert.ok(calls.some(([type]) => type === 'save'));
});

test('emits a handoff when the assistant requests human intervention', async (t) => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalGrokApiKey = process.env.GROK_API_KEY;
  const originalPost = require('axios').post;
  process.env.GROQ_API_KEY = 'test-key';
  delete process.env.GROK_API_KEY;
  t.after(() => {
    if (originalApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalApiKey;
    if (originalGrokApiKey === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = originalGrokApiKey;
    require('axios').post = originalPost;
  });
  require('axios').post = async () => ({
    data: {
      choices: [{ message: { content: '{"reply":"Je transmets votre demande.","in_scope":true,"handoff":true,"handoff_reason":"réclamation"}' } }],
      usage: { total_tokens: 10 }
    }
  });

  const calls = [];
  const prisma = {
    contact: { update: async (args) => calls.push(['pause', args.data.ia_paused]) },
    message: { create: async (args) => calls.push(['save', args.data.content]) }
  };
  const waManager = {
    emitToProfileAccount: (profileId, event) => calls.push(['event', profileId, event]),
    sendMessage: async (profileId, from, text) => {
      calls.push(['send', profileId, from, text]);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: () => {},
    addToCache: () => {}
  };

  await messageHandler._callGroqAPI(
    'Je suis mécontent',
    { id: 12, phone_number: '0000000000' },
    {},
    prisma,
    3,
    { ia_enabled: true },
    '0000000000@c.us',
    [],
    [],
    waManager,
    null
  );

  assert.ok(calls.some(([type, value]) => type === 'pause' && value === true));
  assert.ok(calls.some(([type, profileId, event]) => type === 'event' && profileId === 3 && event === 'human-handoff'));
  assert.ok(calls.some(([type, , , text]) => type === 'send' && text.includes('réponses automatiques sont suspendues')));
});

test('replaces model-generated out-of-scope content with a fixed refusal', async (t) => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalGrokApiKey = process.env.GROK_API_KEY;
  const originalPost = require('axios').post;
  process.env.GROQ_API_KEY = 'test-key';
  delete process.env.GROK_API_KEY;
  require('axios').post = async () => ({
    data: {
      choices: [{ message: { content: '{"reply":"Voici un script PHP complet.","in_scope":false,"handoff":false,"handoff_reason":""}' } }],
      usage: { total_tokens: 10 }
    }
  });
  t.after(() => {
    if (originalApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalApiKey;
    if (originalGrokApiKey === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = originalGrokApiKey;
    require('axios').post = originalPost;
  });

  const calls = [];
  const waManager = {
    emitToProfileAccount: () => {},
    sendMessage: async (profileId, from, text) => {
      calls.push(['send', text]);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: () => {},
    addToCache: () => {}
  };
  await messageHandler._callGroqAPI(
    'Aide-moi à coder en PHP',
    { id: 12, phone_number: '0000000000' },
    {},
    { message: { create: async () => {} } },
    3,
    { bot_name: 'Sébasse NOVALYS' },
    '0000000000@c.us',
    [],
    [],
    waManager,
    null
  );

  const sentReply = calls.find(([type]) => type === 'send')[1];
  assert.match(sentReply, /produits et services/);
  assert.doesNotMatch(sentReply, /script PHP/);
});

test('sends a safe handoff instead of exposing malformed model output', async (t) => {
  const originalApiKey = process.env.GROQ_API_KEY;
  const originalGrokApiKey = process.env.GROK_API_KEY;
  const originalPost = require('axios').post;
  process.env.GROQ_API_KEY = 'test-key';
  delete process.env.GROK_API_KEY;
  require('axios').post = async () => ({
    data: {
      choices: [{ message: { content: '{"reply":"Voici la réponse incomplète' } }],
      usage: { total_tokens: 10 }
    }
  });
  t.after(() => {
    if (originalApiKey === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalApiKey;
    if (originalGrokApiKey === undefined) delete process.env.GROK_API_KEY;
    else process.env.GROK_API_KEY = originalGrokApiKey;
    require('axios').post = originalPost;
  });

  const calls = [];
  const waManager = {
    emitToProfileAccount: (profileId, event) => calls.push(['event', event]),
    sendMessage: async (profileId, from, text) => {
      calls.push(['send', text]);
      return { id: { _serialized: 'sent-id' } };
    },
    trackBotSentId: () => {},
    addToCache: () => {}
  };
  const prisma = {
    contact: { update: async () => calls.push(['pause']) },
    message: { create: async () => {} }
  };
  await messageHandler._callGroqAPI(
    'Question métier',
    { id: 12, phone_number: '0000000000' },
    {},
    prisma,
    3,
    { bot_name: 'Sébasse NOVALYS' },
    '0000000000@c.us',
    [],
    [],
    waManager,
    null
  );

  assert.ok(calls.some(([type]) => type === 'pause'));
  assert.ok(calls.some(([type, event]) => type === 'event' && event === 'human-handoff'));
  const sentReply = calls.find(([type]) => type === 'send')[1];
  assert.match(sentReply, /difficulté/);
  assert.doesNotMatch(sentReply, /Voici la réponse incomplète|\{"reply"/);
});
