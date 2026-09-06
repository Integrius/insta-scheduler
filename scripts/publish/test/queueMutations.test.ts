import { describe, it, expect } from 'vitest';
import { markPublished, markFailed, applyResults } from '../src/queueMutations';
import { QueueEntry } from '../src/types';

function entry(overrides: Partial<QueueEntry>): QueueEntry {
  return {
    id: 'id-1',
    video_url: 'https://example.com/video.mp4',
    account_id: 'acc-1',
    platform: 'instagram',
    date: '2026-09-06',
    caption: 'caption',
    status: 'scheduled',
    created_at: '2026-09-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('markPublished', () => {
  it('sets status to published and stamps published_at', () => {
    const result = markPublished(entry({}), '2026-09-06T12:00:00.000Z');
    expect(result.status).toBe('published');
    expect(result.published_at).toBe('2026-09-06T12:00:00.000Z');
  });
});

describe('markFailed', () => {
  it('sets status to failed and stores the error message', () => {
    const result = markFailed(entry({}), 'network timeout');
    expect(result.status).toBe('failed');
    expect(result.error).toBe('network timeout');
  });
});

describe('applyResults', () => {
  it('moves published entries from queue to history', () => {
    const queue = [entry({ id: 'a' })];
    const { queue: nextQueue, history: nextHistory } = applyResults(
      queue,
      [],
      [{ id: 'a', outcome: 'published', publishedAt: '2026-09-06T12:00:00.000Z' }]
    );
    expect(nextQueue).toEqual([]);
    expect(nextHistory).toHaveLength(1);
    expect(nextHistory[0].status).toBe('published');
  });

  it('keeps failed entries in the queue, marked as failed', () => {
    const queue = [entry({ id: 'a' })];
    const { queue: nextQueue, history: nextHistory } = applyResults(
      queue,
      [],
      [{ id: 'a', outcome: 'failed', error: 'account disconnected' }]
    );
    expect(nextHistory).toEqual([]);
    expect(nextQueue).toHaveLength(1);
    expect(nextQueue[0].status).toBe('failed');
    expect(nextQueue[0].error).toBe('account disconnected');
  });

  it('leaves entries with no matching result untouched', () => {
    const queue = [entry({ id: 'a' }), entry({ id: 'b', date: '2026-09-20' })];
    const { queue: nextQueue } = applyResults(
      queue,
      [],
      [{ id: 'a', outcome: 'published', publishedAt: '2026-09-06T12:00:00.000Z' }]
    );
    expect(nextQueue).toHaveLength(1);
    expect(nextQueue[0].id).toBe('b');
  });
});
