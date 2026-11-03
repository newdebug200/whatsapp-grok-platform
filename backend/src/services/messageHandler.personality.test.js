'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const messageHandler = require('./messageHandler');

const personalities = [
  ['autonomous', 'Tu es un agent autonome et attentif au contexte'],
  ['professional', 'professionnelle, courtoise, claire et fiable'],
  ['friendly', 'amicale, chaleureuse et naturelle'],
  ['commercial', 'sans pression, fausse urgence ni promesse non vérifiée'],
  ['support', 'patient et méthodique'],
  ['empathetic', 'bienveillant et respectueux'],
  ['concise', 'messages courts, lisibles et pratiques']
];

for (const [personality, expectedInstruction] of personalities) {
  test(`builds the ${personality} bot personality prompt`, () => {
    const prompt = messageHandler._buildSystemPrompt({ personality });
    assert.ok(prompt.includes(expectedInstruction));
  });
}

test('uses the autonomous personality when none is configured', () => {
  const prompt = messageHandler._buildSystemPrompt({});
  assert.ok(prompt.includes('Tu es un agent autonome et attentif au contexte'));
});

test('falls back to the autonomous personality for unknown values', () => {
  const prompt = messageHandler._buildSystemPrompt({ personality: 'unknown' });
  assert.ok(prompt.includes('Tu es un agent autonome et attentif au contexte'));
});
