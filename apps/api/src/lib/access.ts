import { prisma } from '@avf/database';

/**
 * Ownership-chain access helpers. Every lookup walks the full
 * user -> project -> channel -> series -> topic / knowledge chain so that
 * multi-channel isolation is enforced in one place.
 */

export async function getProject(userId: string, projectId: string) {
  return prisma.project.findFirstOrThrow({ where: { id: projectId, userId } });
}

export async function getChannel(userId: string, channelId: string) {
  return prisma.publishingChannel.findFirstOrThrow({
    where: { id: channelId, project: { userId } },
  });
}

export async function getSeries(userId: string, seriesId: string) {
  return prisma.contentSeries.findFirstOrThrow({
    where: {
      id: seriesId,
      OR: [{ channel: { project: { userId } } }, { campaign: { project: { userId } } }],
    },
    include: { channel: { select: { projectId: true } }, campaign: { select: { projectId: true } } },
  });
}

export async function getTopic(userId: string, topicId: string) {
  return prisma.topic.findFirstOrThrow({
    where: { id: topicId, project: { userId } },
  });
}

export async function getSeriesTopic(userId: string, seriesId: string, topicId: string) {
  return prisma.topic.findFirstOrThrow({
    where: { id: topicId, seriesId, project: { userId } },
  });
}

export async function getKnowledge(userId: string, knowledgeId: string) {
  return prisma.channelKnowledge.findFirstOrThrow({
    where: { id: knowledgeId, channel: { project: { userId } } },
  });
}

export async function getCampaign(userId: string, campaignId: string) {
  return prisma.contentCampaign.findFirstOrThrow({
    where: { id: campaignId, project: { userId } },
  });
}

export async function getCampaignAssignment(userId: string, campaignId: string, assignmentId: string) {
  return prisma.campaignChannelAssignment.findFirstOrThrow({
    where: { id: assignmentId, campaign: { project: { userId }, id: campaignId } },
  });
}

export async function getAccount(userId: string, accountId: string) {
  return prisma.publishingAccount.findFirstOrThrow({
    where: { id: accountId, project: { userId } },
  });
}

export async function getCampaignKnowledge(userId: string, knowledgeId: string) {
  return prisma.campaignKnowledge.findFirstOrThrow({
    where: { id: knowledgeId, campaign: { project: { userId } } },
  });
}

export async function getCampaignSeries(userId: string, campaignId: string, seriesId: string) {
  return prisma.contentSeries.findFirstOrThrow({
    where: { id: seriesId, campaignId, OR: [{ channel: { project: { userId } } }, { campaign: { project: { userId } } }] },
  });
}
