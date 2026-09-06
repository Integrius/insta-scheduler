import { describe, it, expect, vi } from 'vitest';
import { uploadVideoAsset } from '../src/github';

const config = { token: 'gh_token', owner: 'hans', repo: 'insta-scheduler' };

describe('uploadVideoAsset', () => {
  it('reuses the existing "media" release when present, and uploads the asset to it', async () => {
    const fetchImpl = vi.fn()
      // GET releases/tags/media -> found
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, upload_url: 'https://uploads.github.com/repos/hans/insta-scheduler/releases/1/assets{?name,label}' }),
      })
      // POST upload asset -> created
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ browser_download_url: 'https://github.com/hans/insta-scheduler/releases/download/media/video.mp4' }),
      });

    const url = await uploadVideoAsset(
      { ...config, fetchImpl },
      'video.mp4',
      new ArrayBuffer(8),
      'video/mp4'
    );

    expect(url).toBe('https://github.com/hans/insta-scheduler/releases/download/media/video.mp4');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadOptions] = fetchImpl.mock.calls[1];
    expect(uploadUrl).toBe('https://uploads.github.com/repos/hans/insta-scheduler/releases/1/assets?name=video.mp4');
    expect(uploadOptions.headers['Content-Type']).toBe('video/mp4');
  });

  it('creates the "media" release first when it does not exist yet', async () => {
    const fetchImpl = vi.fn()
      // GET releases/tags/media -> not found
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
      // POST create release -> created
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 2, upload_url: 'https://uploads.github.com/repos/hans/insta-scheduler/releases/2/assets{?name,label}' }),
      })
      // POST upload asset -> created
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ browser_download_url: 'https://github.com/hans/insta-scheduler/releases/download/media/video2.mp4' }),
      });

    const url = await uploadVideoAsset(
      { ...config, fetchImpl },
      'video2.mp4',
      new ArrayBuffer(8),
      'video/mp4'
    );

    expect(url).toBe('https://github.com/hans/insta-scheduler/releases/download/media/video2.mp4');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws when the asset upload request fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, upload_url: 'https://uploads.github.com/repos/hans/insta-scheduler/releases/1/assets{?name,label}' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'asset already exists' });

    await expect(
      uploadVideoAsset({ ...config, fetchImpl }, 'video.mp4', new ArrayBuffer(8), 'video/mp4')
    ).rejects.toThrow('Failed to upload video asset (422): asset already exists');
  });
});
