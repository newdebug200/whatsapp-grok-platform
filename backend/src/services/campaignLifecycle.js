'use strict';

async function resetCompletedCampaign(prisma, campaignId) {
  return prisma.$transaction(async (transaction) => {
    const resetTargets = await transaction.campaignTarget.updateMany({
      where: { campaign_id: campaignId },
      data: { status: 'pending', sent_at: null, error: null }
    });
    await transaction.campaign.update({
      where: { id: campaignId },
      data: { status: 'draft', completed_at: null }
    });
    return resetTargets.count;
  });
}

module.exports = { resetCompletedCampaign };
