'use strict';

function selectCampaignVariant(messages, random = Math.random) {
  if (!Array.isArray(messages) || messages.length === 0) {
    throw new Error('Une campagne doit contenir au moins une variante');
  }
  const index = Math.min(messages.length - 1, Math.floor(random() * messages.length));
  return messages[index];
}

module.exports = { selectCampaignVariant };
