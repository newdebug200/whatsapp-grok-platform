'use strict';

const MIN_RESPONSE_DELAY_SECONDS = 60;
const MAX_RESPONSE_DELAY_SECONDS = 300;
const DEFAULT_RESPONSE_DELAY_SECONDS = 120;

function normalizeResponseDelay(value, fallback = DEFAULT_RESPONSE_DELAY_SECONDS) {
  const parsed = value === null || value === undefined || value === '' ? Number.NaN : Number(value);
  const seconds = Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
  return Math.min(MAX_RESPONSE_DELAY_SECONDS, Math.max(MIN_RESPONSE_DELAY_SECONDS, seconds));
}

module.exports = {
  MIN_RESPONSE_DELAY_SECONDS,
  MAX_RESPONSE_DELAY_SECONDS,
  DEFAULT_RESPONSE_DELAY_SECONDS,
  normalizeResponseDelay
};
