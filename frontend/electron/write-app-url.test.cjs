'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { normalizeAppUrl } = require('./write-app-url.cjs');

test('requires a valid HTTPS user-dashboard URL for distribution builds', () => {
  assert.equal(normalizeAppUrl('https://app.example.com/'), 'https://app.example.com/');
  assert.throws(() => normalizeAppUrl(''), /must be set/);
  assert.throws(() => normalizeAppUrl('not a URL'), /valid absolute URL/);
  assert.throws(() => normalizeAppUrl('http://app.example.com'), /requires an HTTPS URL/);
  assert.throws(
    () => normalizeAppUrl('https://user:password@app.example.com/'),
    /must not contain credentials/
  );
});

test('allows localhost over HTTP only for local development', () => {
  assert.equal(
    normalizeAppUrl('http://localhost:5173/', { allowLocal: true }),
    'http://localhost:5173/'
  );
  assert.throws(() => normalizeAppUrl('http://localhost:5173/'), /requires an HTTPS URL/);
  assert.throws(
    () => normalizeAppUrl('http://192.168.1.5:5173/', { allowLocal: true }),
    /requires an HTTPS URL/
  );
});
