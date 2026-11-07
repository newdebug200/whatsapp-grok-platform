'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_RESPONSE_DELAY_SECONDS,
  MIN_RESPONSE_DELAY_SECONDS,
  MAX_RESPONSE_DELAY_SECONDS,
  normalizeResponseDelay
} = require('./responseDelay');

test('response delay defaults to two minutes', () => {
  assert.equal(DEFAULT_RESPONSE_DELAY_SECONDS, 120);
  assert.equal(normalizeResponseDelay(undefined), 120);
  assert.equal(normalizeResponseDelay(null), 120);
  assert.equal(normalizeResponseDelay(''), 120);
  assert.equal(normalizeResponseDelay('invalid'), 120);
});

test('response delay stays between one and five minutes', () => {
  assert.equal(normalizeResponseDelay(1), MIN_RESPONSE_DELAY_SECONDS);
  assert.equal(normalizeResponseDelay(60), 60);
  assert.equal(normalizeResponseDelay(301), MAX_RESPONSE_DELAY_SECONDS);
});

test('response delay truncates fractions without changing valid values', () => {
  assert.equal(normalizeResponseDelay(120.9), 120);
  assert.equal(normalizeResponseDelay(240), 240);
});
