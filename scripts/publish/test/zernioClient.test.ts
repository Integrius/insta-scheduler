import { describe, it, expect, vi } from 'vitest';
import { publishInstagramPost } from '../src/zernioClient';

describe('publishInstagramPost', () => {
  it('POSTs to https://zernio.com/api/v1/posts with the expected body and auth header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    await publishInstagramPost({
      apiKey: 'sk_test',
      accountId: 'acc-1',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'Hello world #test',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://zernio.com/api/v1/posts');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer sk_test');
    expect(JSON.parse(options.body)).toEqual({
      content: 'Hello world #test',
      mediaItems: [{ type: 'video', url: 'https://example.com/video.mp4' }],
      platforms: [{ platform: 'instagram', accountId: 'acc-1' }],
      publishNow: true,
    });
  });

  it('throws with the response body when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'account not found',
    });

    await expect(
      publishInstagramPost({
        apiKey: 'sk_test',
        accountId: 'acc-1',
        videoUrl: 'https://example.com/video.mp4',
        caption: 'x',
        fetchImpl,
      })
    ).rejects.toThrow('Zernio publish failed (400): account not found');
  });
});
