export function isFeatureEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    return !['false', '0', 'off', 'disabled', 'no'].includes(value.trim().toLowerCase());
  }
  return Boolean(value);
}
