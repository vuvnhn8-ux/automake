import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createServer, type Server } from 'node:http';
import { GenericPlatformProvider, createPlatformProvider, SocialProviderError } from '../src/index.js';

describe('GenericPlatformProvider', () => {
  it('publishes in mock mode without a network call', async () => {
    const provider = new GenericPlatformProvider('TIKTOK');
    const result = await provider.publishVideo({
      pageId: 'dest-1',
      accessToken: 'secret',
      description: 'Hello',
      videoPath: '/tmp/v.mp4',
    });
    expect(result.postId).toMatch(/^mock:tiktok:/);
    expect(result.scheduled).toBe(false);
    expect(result.permalinkUrl).toBeNull();
  });

  it('returns scheduled=true when a publish time is set', async () => {
    const provider = new GenericPlatformProvider('YOUTUBE');
    const result = await provider.publishVideo({
      pageId: 'dest-1',
      accessToken: 'secret',
      description: 'Hello',
      scheduledPublishTime: 1900000000,
    });
    expect(result.scheduled).toBe(true);
  });

  it('throws for unsupported OAuth flows', async () => {
    const provider = new GenericPlatformProvider('TIKTOK');
    expect(() => provider.getLoginUrl('state')).toThrow(SocialProviderError);
    expect(() => provider.exchangeCodeForToken('code')).toThrow(SocialProviderError);
    expect(() => provider.listPages('token')).toThrow(SocialProviderError);
  });

  it('posts to a configured HTTP endpoint when metadata.endpoint is set', async () => {
    let received: Record<string, unknown> | null = null;
    const server: Server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        received = JSON.parse(body);
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ id: 'remote-1' }));
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new GenericPlatformProvider('INSTAGRAM', {
        endpoint: `http://127.0.0.1:${port}/publish`,
        apiKey: 'k123',
      });
      const result = await provider.publishVideo({
        pageId: 'dest-1',
        accessToken: 'secret',
        description: 'Hello world',
      });
      expect(result.postId).toBe('remote-1');
      expect(received).toMatchObject({
        platform: 'INSTAGRAM',
        destinationId: 'dest-1',
        description: 'Hello world',
      });
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  it('fails when the endpoint responds with an error', async () => {
    const server: Server = createServer((_req, res) => {
      res.statusCode = 500;
      res.end('boom');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as { port: number }).port;

    try {
      const provider = new GenericPlatformProvider('YOUTUBE', {
        endpoint: `http://127.0.0.1:${port}/publish`,
      });
      await expect(
        provider.publishVideo({ pageId: 'x', accessToken: 't', description: 'd' }),
      ).rejects.toThrow(SocialProviderError);
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});

describe('createPlatformProvider', () => {
  it('returns the Facebook Graph client for FACEBOOK', () => {
    const provider = createPlatformProvider('FACEBOOK');
    expect(provider.name).toBe('FACEBOOK');
  });

  it('returns a generic provider for other platforms', () => {
    const provider = createPlatformProvider('tiktok');
    expect(provider).toBeInstanceOf(GenericPlatformProvider);
    expect(provider.name).toBe('TIKTOK');
  });
});
