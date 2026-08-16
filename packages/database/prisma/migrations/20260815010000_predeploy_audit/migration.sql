-- Pre-deploy audit hardening: schedule timezone + channel<->facebook page link
-- Hand-maintained migration; must stay in sync with prisma/schema.prisma

ALTER TABLE "Schedule" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'Asia/Tokyo';

ALTER TABLE "PublishingChannel" ADD COLUMN "facebookPageId" UUID;

ALTER TABLE "PublishingChannel" ADD CONSTRAINT "PublishingChannel_facebookPageId_fkey"
    FOREIGN KEY ("facebookPageId") REFERENCES "FacebookPage"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "PublishingChannel_facebookPageId_idx" ON "PublishingChannel"("facebookPageId");
