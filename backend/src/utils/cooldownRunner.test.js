'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { createCooldownRunner } = require('./cooldownRunner');

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('deduplicates concurrent work and applies cooldown after completion', async () => {
  const runWithCooldown = createCooldownRunner(100);
  let calls = 0;
  let resolveTask;
  const task = () => {
    calls += 1;
    return new Promise(resolve => { resolveTask = resolve; });
  };

  const first = runWithCooldown(7, task);
  const concurrent = runWithCooldown(7, task);
  await wait(0);
  assert.equal(calls, 1);

  resolveTask(true);
  assert.equal(await first, true);
  assert.equal(await concurrent, true);
  assert.equal(await runWithCooldown(7, task), false);
  assert.equal(calls, 1);
});

test('allows work again after the cooldown expires', async () => {
  const runWithCooldown = createCooldownRunner(20);
  let calls = 0;
  const task = async () => { calls += 1; return true; };

  assert.equal(await runWithCooldown('account', task), true);
  assert.equal(await runWithCooldown('account', task), false);
  await wait(30);
  assert.equal(await runWithCooldown('account', task), true);
  assert.equal(calls, 2);
});

test('does not share cooldowns between different accounts', async () => {
  const runWithCooldown = createCooldownRunner(100);
  let calls = 0;
  const task = async () => { calls += 1; return true; };

  assert.equal(await runWithCooldown(1, task), true);
  assert.equal(await runWithCooldown(2, task), true);
  assert.equal(calls, 2);
});
