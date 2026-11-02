'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { resetCompletedCampaign } = require('./campaignLifecycle');

test('restarting a completed campaign resets all targets and completion state atomically', async () => {
  const calls = [];
  const prisma = {
    $transaction: async (operation) => operation({
      campaignTarget: {
        updateMany: async (args) => {
          calls.push(['targets', args]);
          return { count: 3 };
        }
      },
      campaign: {
        update: async (args) => {
          calls.push(['campaign', args]);
        }
      }
    })
  };

  const resetCount = await resetCompletedCampaign(prisma, 42);

  assert.equal(resetCount, 3);
  assert.deepEqual(calls, [
    ['targets', {
      where: { campaign_id: 42 },
      data: { status: 'pending', sent_at: null, error: null }
    }],
    ['campaign', {
      where: { id: 42 },
      data: { status: 'draft', completed_at: null }
    }]
  ]);
});
