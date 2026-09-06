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

import { readQueueFile, writeQueueFile } from '../src/github';

describe('readQueueFile', () => {
  it('decodes base64 content and returns it with the file sha', async () => {
    const encoded = btoa(JSON.stringify([{ id: 'a' }]));
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: encoded, sha: 'sha-1' }),
    });

    const result = await readQueueFile({ ...config, fetchImpl }, 'queue.json');

    expect(result).toEqual({ content: [{ id: 'a' }], sha: 'sha-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/hans/insta-scheduler/contents/queue.json',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer gh_token' }) })
    );
  });

  it('returns an empty array with a null sha when the file does not exist yet', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });

    const result = await readQueueFile({ ...config, fetchImpl }, 'queue.json');

    expect(result).toEqual({ content: [], sha: null });
  });
});

describe('writeQueueFile', () => {
  it('PUTs base64-encoded content with the sha for an update', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await writeQueueFile({ ...config, fetchImpl }, 'queue.json', [{ id: 'a' }], 'sha-1', 'Schedule post');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/hans/insta-scheduler/contents/queue.json');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body);
    expect(body.sha).toBe('sha-1');
    expect(body.message).toBe('Schedule post');
    expect(JSON.parse(atob(body.content))).toEqual([{ id: 'a' }]);
  });

  it('omits sha when creating the file for the first time', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

    await writeQueueFile({ ...config, fetchImpl }, 'queue.json', [{ id: 'a' }], null, 'Create queue');

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.sha).toBeUndefined();
  });

  it('throws when the write fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'sha mismatch' });

    await expect(
      writeQueueFile({ ...config, fetchImpl }, 'queue.json', [], 'sha-1', 'msg')
    ).rejects.toThrow('Failed to write queue.json (409): sha mismatch');
  });
});
