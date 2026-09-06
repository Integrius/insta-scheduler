import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDailyPublish } from '../src/index';

let dir: string;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'insta-scheduler-'));
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe('runDailyPublish', () => {
  it('publishes due entries, moves them to history, and leaves future entries in the queue', async () => {
    const queuePath = join(dir, 'queue.json');
    const historyPath = join(dir, 'history.json');

    await writeFile(
      queuePath,
      JSON.stringify([
        {
          id: 'a',
          video_url: 'https://example.com/a.mp4',
          account_id: 'acc-1',
          platform: 'instagram',
          date: '2026-09-06',
          caption: 'Post A',
          status: 'scheduled',
          created_at: '2026-09-01T00:00:00.000Z',
        },
        {
          id: 'b',
          video_url: 'https://example.com/b.mp4',
          account_id: 'acc-1',
          platform: 'instagram',
          date: '2026-09-20',
          caption: 'Post B',
          status: 'scheduled',
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ])
    );
    await writeFile(historyPath, '[]');

    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    const result = await runDailyPublish({
      queuePath,
      historyPath,
      apiKey: 'sk_test',
      today: '2026-09-06',
      fetchImpl,
    });

    expect(result).toEqual({ published: 1, failed: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const queue = JSON.parse(await readFile(queuePath, 'utf-8'));
    expect(queue).toHaveLength(1);
    expect(queue[0].id).toBe('b');

    const history = JSON.parse(await readFile(historyPath, 'utf-8'));
    expect(history).toHaveLength(1);
    expect(history[0].id).toBe('a');
    expect(history[0].status).toBe('published');
  });

  it('keeps a failed entry in the queue with the error recorded', async () => {
    const queuePath = join(dir, 'queue.json');
    const historyPath = join(dir, 'history.json');

    await writeFile(
      queuePath,
      JSON.stringify([
        {
          id: 'a',
          video_url: 'https://example.com/a.mp4',
          account_id: 'acc-1',
          platform: 'instagram',
          date: '2026-09-06',
          caption: 'Post A',
          status: 'scheduled',
          created_at: '2026-09-01T00:00:00.000Z',
        },
      ])
    );
    await writeFile(historyPath, '[]');

    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => 'bad account' });

    const result = await runDailyPublish({
      queuePath,
      historyPath,
      apiKey: 'sk_test',
      today: '2026-09-06',
      fetchImpl,
    });

    expect(result).toEqual({ published: 0, failed: 1 });

    const queue = JSON.parse(await readFile(queuePath, 'utf-8'));
    expect(queue).toHaveLength(1);
    expect(queue[0].status).toBe('failed');
    expect(queue[0].error).toContain('bad account');
  });
});
