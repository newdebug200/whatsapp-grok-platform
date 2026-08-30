function normalizeComparable(value) {
  return String(value || '').replace(/[\s()+\-]/g, '').toLowerCase();
}

function isRawWhatsAppIdentifier(value) {
  const text = String(value || '').trim();
  return /^group_\d+$/i.test(text)
    || /^\d{7,15}@(c\.us|lid|g\.us)$/i.test(text);
}

export function getContactDisplayName(contact) {
  const name = String(contact?.name || '').trim();
  const phone = String(contact?.phone_number || '').trim();
  const waId = String(contact?.wa_id || '').trim();
  const phoneDigits = normalizeComparable(phone).replace(/\D/g, '');
  const waDigits = normalizeComparable(waId.split('@')[0]).replace(/\D/g, '');
  const comparableName = normalizeComparable(name);

  const nameLooksLikeIdentifier = !name
    || isRawWhatsAppIdentifier(name)
    || name.toLowerCase() === waId.toLowerCase()
    || comparableName === phoneDigits
    || comparableName === waDigits;

  if (!nameLooksLikeIdentifier) return name;
  if (phone && !isRawWhatsAppIdentifier(phone)) return phone;
  return 'Contact inconnu';
}

export function getContactInitial(contact) {
  return getContactDisplayName(contact).charAt(0).toUpperCase() || '?';
}
