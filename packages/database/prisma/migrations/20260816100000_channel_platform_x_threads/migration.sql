-- Add X and THREADS to the ChannelPlatform enum (additive; safe for live data)
ALTER TYPE "ChannelPlatform" ADD VALUE IF NOT EXISTS 'X';
ALTER TYPE "ChannelPlatform" ADD VALUE IF NOT EXISTS 'THREADS';
