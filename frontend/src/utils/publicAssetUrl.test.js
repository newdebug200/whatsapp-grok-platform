import assert from 'node:assert/strict';
import test from 'node:test';
import { publicAssetUrl } from './publicAssetUrl.js';

test('builds public asset paths from the configured app base', () => {
  assert.equal(publicAssetUrl('/icons/icon-192.png', './'), './icons/icon-192.png');
  assert.equal(publicAssetUrl('icons/icon-192.png', '/'), '/icons/icon-192.png');
});
