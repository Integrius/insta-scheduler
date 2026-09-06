import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/zernioAccounts', () => ({
  listInstagramAccounts: vi.fn(),
}));
vi.mock('../src/caption', () => ({
  generateCaption: vi.fn(),
}));
vi.mock('../src/github', () => ({
  uploadVideoAsset: vi.fn(),
  readQueueFile: vi.fn(),
  writeQueueFile: vi.fn(),
}));

import worker from '../src/index';
import { listInstagramAccounts } from '../src/zernioAccounts';
import { generateCaption } from '../src/caption';
import { uploadVideoAsset, readQueueFile, writeQueueFile } from '../src/github';

const env = {
  APP_PASSWORD: 'secret',
  GITHUB_TOKEN: 'gh_token',
  GITHUB_OWNER: 'hans',
  GITHUB_REPO: 'insta-scheduler',
  ANTHROPIC_API_KEY: 'sk-ant',
  ZERNIO_API_KEY: 'sk-zernio',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('worker fetch handler', () => {
  it('rejects /accounts without the correct password', async () => {
    const request = new Request('https://worker.example/accounts', {
      headers: { 'x-app-password': 'wrong' },
    });
    const res = await worker.fetch(request, env as any);
    expect(res.status).toBe(401);
    expect(listInstagramAccounts).not.toHaveBeenCalled();
  });

  it('returns accounts for /accounts with the correct password', async () => {
    (listInstagramAccounts as any).mockResolvedValue([{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }]);

    const request = new Request('https://worker.example/accounts', {
      headers: { 'x-app-password': 'secret' },
    });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accounts: [{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }] });
  });

  it('rejects /caption without the correct password', async () => {
    const request = new Request('https://worker.example/caption', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong', hint: '', frame_base64: 'x' }),
    });
    const res = await worker.fetch(request, env as any);
    expect(res.status).toBe(401);
    expect(generateCaption).not.toHaveBeenCalled();
  });

  it('returns a generated caption for /caption with the correct password', async () => {
    (generateCaption as any).mockResolvedValue('Legenda gerada #bike');

    const request = new Request('https://worker.example/caption', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret', hint: 'bike amarela', frame_base64: 'ZmFrZQ==' }),
    });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ caption: 'Legenda gerada #bike' });
  });

  it('schedules a post for /schedule with the correct password', async () => {
    (uploadVideoAsset as any).mockResolvedValue('https://github.com/hans/insta-scheduler/releases/download/media/video.mp4');
    (readQueueFile as any).mockResolvedValue({ content: [], sha: 'sha-1' });
    (writeQueueFile as any).mockResolvedValue(undefined);

    const form = new FormData();
    form.set('password', 'secret');
    form.set('account_id', 'acc-1');
    form.set('date', '2026-09-10');
    form.set('caption', 'Hello world');
    form.set('video', new File(['fake-bytes'], 'video.mp4', { type: 'video/mp4' }));

    const request = new Request('https://worker.example/schedule', { method: 'POST', body: form });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.account_id).toBe('acc-1');
    expect(body.entry.date).toBe('2026-09-10');
    expect(body.entry.status).toBe('scheduled');
    expect(writeQueueFile).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for an unknown route', async () => {
    const request = new Request('https://worker.example/unknown');
    const res = await worker.fetch(request, env as any);
    expect(res.status).toBe(404);
  });

  it('rejects /schedule with a malformed date', async () => {
    const form = new FormData();
    form.set('password', 'secret');
    form.set('account_id', 'acc-1');
    form.set('date', '10/09/2026');
    form.set('caption', 'Hello world');
    form.set('video', new File(['fake-bytes'], 'video.mp4', { type: 'video/mp4' }));

    const request = new Request('https://worker.example/schedule', { method: 'POST', body: form });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'invalid_date_format' });
    expect(uploadVideoAsset).not.toHaveBeenCalled();
  });

  it('rejects /schedule with a video over the 50MB size limit', async () => {
    const bigFile = new File([new Uint8Array(50 * 1024 * 1024 + 1)], 'video.mp4', { type: 'video/mp4' });

    const form = new FormData();
    form.set('password', 'secret');
    form.set('account_id', 'acc-1');
    form.set('date', '2026-09-10');
    form.set('caption', 'Hello world');
    form.set('video', bigFile);

    const request = new Request('https://worker.example/schedule', { method: 'POST', body: form });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'Video too large (max 50MB)' });
    expect(uploadVideoAsset).not.toHaveBeenCalled();
  });

  it('returns a generic error message and does not leak internal error details on unexpected failures', async () => {
    (listInstagramAccounts as any).mockRejectedValue(new Error('secret internal detail: owner/repo token xyz'));
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const request = new Request('https://worker.example/accounts', {
      headers: { 'x-app-password': 'secret' },
    });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'internal_error' });
    expect(consoleErrorSpy).toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });
});
