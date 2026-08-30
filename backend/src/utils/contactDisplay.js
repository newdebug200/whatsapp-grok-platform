function normalizeComparable(value) {
  return String(value || '').replace(/[\s()+\-]/g, '').toLowerCase();
}

function isUsableContactName(name, phoneNumber, waId) {
  const value = String(name || '').trim();
  if (!value) return false;

  const comparable = normalizeComparable(value);
  const phoneDigits = normalizeComparable(phoneNumber).replace(/\D/g, '');
  const waDigits = normalizeComparable(String(waId || '').split('@')[0]).replace(/\D/g, '');
  const rawWaId = String(waId || '').trim().toLowerCase();

  return value.toLowerCase() !== rawWaId
    && comparable !== phoneDigits
    && comparable !== waDigits
    && !/^group_\d+$/i.test(value)
    && !/^\d{7,15}@(c\.us|lid|g\.us)$/i.test(value);
}

function resolveContactName(contact, phoneNumber, waId) {
  const candidates = [
    contact?.name,
    contact?.pushname,
    contact?.shortName,
    contact?.verifiedName
  ];
  return candidates.find((candidate) => isUsableContactName(candidate, phoneNumber, waId))?.trim() || null;
}

module.exports = { isUsableContactName, resolveContactName };
