'use strict';

const SENT_MESSAGE_ORIGINS = Object.freeze([
  'ai',
  'campaign',
  'manual',
  'automation',
  'whatsapp',
  'unknown'
]);

function createMessageCounts() {
  return {
    received: 0,
    sent: 0,
    ...Object.fromEntries(SENT_MESSAGE_ORIGINS.map(origin => [origin, 0]))
  };
}

function addMessageCount(counts, message) {
  if (message.direction === 'received') {
    counts.received += 1;
  } else if (message.direction === 'sent') {
    counts.sent += 1;
    const origin = SENT_MESSAGE_ORIGINS.includes(message.origin) ? message.origin : 'unknown';
    counts[origin] += 1;
  }
  return counts;
}

module.exports = { addMessageCount, createMessageCounts, SENT_MESSAGE_ORIGINS };
