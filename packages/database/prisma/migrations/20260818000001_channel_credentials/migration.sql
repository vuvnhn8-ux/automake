-- AlterTable: add optional encrypted credentials column to PublishingChannel
ALTER TABLE "PublishingChannel" ADD COLUMN "credentials" TEXT;
