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

test('parses structured assistant replies and preserves plain-text compatibility', () => {
  assert.deepEqual(
    messageHandler._parseAssistantResponse('```json\n{"reply":"Je vous aide.","handoff":true,"handoff_reason":"demande client"}\n```'),
    { reply: 'Je vous aide.', handoff: true, handoffReason: 'demande client' }
  );
  assert.deepEqual(
    messageHandler._parseAssistantResponse('Réponse simple'),
    { reply: 'Réponse simple', handoff: false, handoffReason: '' }
  );
  assert.deepEqual(
    messageHandler._parseAssistantResponse('{"reply":"","handoff":false}'),
    { reply: '', handoff: false, handoffReason: '' }
  );
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
      choices: [{ message: { content: '{"reply":"Je transmets votre demande.","handoff":true,"handoff_reason":"réclamation"}' } }],
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
  assert.ok(calls.some(([type, , , text]) => type === 'send' && text === 'Je transmets votre demande.'));
});
