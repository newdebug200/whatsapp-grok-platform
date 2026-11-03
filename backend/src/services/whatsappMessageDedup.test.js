'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const whatsappManager = require('./whatsappManager');

test('claims each WhatsApp message once and emits its contact ID to the profile account', async (t) => {
  const originalGetEntry = whatsappManager._getEntryByProfileId;
  const originalIO = whatsappManager.io;
  const profileId = 987654;
  const messageId = 'true_15551234567@c.us_unique-incoming';
  const key = `${profileId}:${messageId}`;
  const events = [];
  t.after(() => {
    whatsappManager._handledWhatsAppMessageIds.delete(key);
    whatsappManager._getEntryByProfileId = originalGetEntry;
    whatsappManager.io = originalIO;
  });

  whatsappManager._getEntryByProfileId = id => id === profileId
    ? { entry: { accountId: 12345 } }
    : null;
  whatsappManager.io = {
    to: room => ({
      emit: (event, payload) => events.push({ room, event, payload })
    })
  };

  assert.equal(whatsappManager._claimWhatsAppMessage(profileId, { id: { _serialized: messageId } }), true);
  assert.equal(whatsappManager._claimWhatsAppMessage(profileId, { id: { _serialized: messageId } }), false);
  assert.equal(whatsappManager.emitNewMessage(profileId, { contactId: 42, body: 'Hello' }), true);
  assert.deepEqual(events, [{
    room: 'account_12345',
    event: 'new-message',
    payload: { contactId: 42, body: 'Hello', profileId }
  }]);
});
