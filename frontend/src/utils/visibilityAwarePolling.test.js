import assert from 'node:assert/strict';
import test from 'node:test';
import { startVisibilityAwarePolling } from './visibilityAwarePolling.js';

class FakeVisibilityTarget {
  hidden = false;
  listeners = new Set();

  addEventListener(_type, listener) {
    this.listeners.add(listener);
  }

  removeEventListener(_type, listener) {
    this.listeners.delete(listener);
  }

  setHidden(hidden) {
    this.hidden = hidden;
    for (const listener of this.listeners) listener();
  }
}

const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms));

test('runs immediately and pauses periodic work while the page is hidden', async () => {
  const visibility = new FakeVisibilityTarget();
  let calls = 0;
  const stop = startVisibilityAwarePolling(() => { calls += 1; }, 25, {
    immediate: true,
    visibilityTarget: visibility
  });

  await wait(5);
  assert.equal(calls, 1);
  visibility.setHidden(true);
  await wait(40);
  assert.equal(calls, 1);

  visibility.setHidden(false);
  await wait(5);
  assert.equal(calls, 2);

  stop();
  await wait(35);
  assert.equal(calls, 2);
  assert.equal(visibility.listeners.size, 0);
});

test('does not overlap periodic requests', async () => {
  const visibility = new FakeVisibilityTarget();
  let running = 0;
  let maxRunning = 0;
  let calls = 0;
  const stop = startVisibilityAwarePolling(async () => {
    calls += 1;
    running += 1;
    maxRunning = Math.max(maxRunning, running);
    await wait(20);
    running -= 1;
  }, 5, { immediate: true, visibilityTarget: visibility });

  const deadline = Date.now() + 1000;
  while (calls < 2 && Date.now() < deadline) await wait(10);
  stop();
  assert.ok(calls >= 2);
  assert.equal(maxRunning, 1);
});
