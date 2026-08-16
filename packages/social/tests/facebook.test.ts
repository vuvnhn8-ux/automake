import { describe, expect, it, vi } from 'vitest';
import { FacebookProvider } from '../src/facebook.js';

describe('FacebookProvider.publishVideo', () => {
  it('uploads via file_url and returns the post id', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: '987654321' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new FacebookProvider();
    const result = await provider.publishVideo({
      pageId: '12345',
      accessToken: 'tok',
      fileUrl: 'https://cdn.example.com/video.mp4',
      description: 'Hello',
    });

    expect(result.postId).toBe('987654321');
    expect(result.scheduled).toBe(false);

    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toContain('/12345/videos');
    expect(url).toContain('graph.facebook.com');
    const body = init.body as FormData;
    expect(body.get('file_url')).toBe('https://cdn.example.com/video.mp4');
    expect(body.get('description')).toBe('Hello');

    vi.unstubAllGlobals();
  });

  it('schedules when scheduledPublishTime is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: 'abc' }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchMock);

    const provider = new FacebookProvider();
    const result = await provider.publishVideo({
      pageId: '12345',
      accessToken: 'tok',
      fileUrl: 'https://cdn.example.com/video.mp4',
      description: 'Hi',
      scheduledPublishTime: 1700000000,
    });

    expect(result.scheduled).toBe(true);
    const [, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    const body = init.body as FormData;
    expect(body.get('published')).toBe('false');
    expect(body.get('scheduled_publish_time')).toBe('1700000000');

    vi.unstubAllGlobals();
  });

  it('throws SocialProviderError with fb error code on Graph failure', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ error: { message: 'Invalid token', code: 190 } }),
          { status: 401 },
        ),
      ),
    );

    const provider = new FacebookProvider();
    await expect(
      provider.publishVideo({
        pageId: '1',
        accessToken: 'bad',
        fileUrl: 'https://x/v.mp4',
        description: '',
      }),
    ).rejects.toMatchObject({ name: 'SocialProviderError', code: 'AUTH_ERROR' });

    vi.unstubAllGlobals();
  });

  it('throws on missing video source', async () => {
    const provider = new FacebookProvider();
    await expect(
      provider.publishVideo({
        pageId: '1',
        accessToken: 'tok',
        description: '',
      } as never),
    ).rejects.toMatchObject({ code: 'INVALID_REQUEST' });
  });
});
