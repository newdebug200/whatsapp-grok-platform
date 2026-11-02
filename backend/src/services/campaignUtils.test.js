'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { selectCampaignVariant } = require('./campaignUtils');

test('campaign selects one variant for each contact', () => {
  const messages = [{ content: 'text' }, { content: 'image', media_type: 'image' }];
  assert.equal(selectCampaignVariant(messages, () => 0), messages[0]);
  assert.equal(selectCampaignVariant(messages, () => 0.99), messages[1]);
});

test('campaign variant selection rejects an empty message list', () => {
  assert.throws(() => selectCampaignVariant([]), /au moins une variante/);
});
