'use strict';

function createCooldownRunner(cooldownMs) {
  const entries = new Map();

  return function runWithCooldown(key, task) {
    if (key === null || key === undefined || key === '') {
      return Promise.reject(new TypeError('A cooldown key is required'));
    }
    if (typeof task !== 'function') {
      return Promise.reject(new TypeError('A cooldown task is required'));
    }

    const now = Date.now();
    const existing = entries.get(key);
    if (existing?.promise) return existing.promise;
    if (existing && now - existing.startedAt < cooldownMs) {
      return Promise.resolve(false);
    }

    if (existing?.timer) clearTimeout(existing.timer);
    const entry = { startedAt: now, promise: null, timer: null };
    entries.set(key, entry);

    entry.promise = Promise.resolve()
      .then(task)
      .finally(() => {
        entry.promise = null;
        const remainingCooldown = Math.max(0, entry.startedAt + cooldownMs - Date.now());
        entry.timer = setTimeout(() => {
          if (entries.get(key) === entry) entries.delete(key);
        }, remainingCooldown);
        entry.timer.unref?.();
      });

    return entry.promise;
  };
}

module.exports = { createCooldownRunner };
