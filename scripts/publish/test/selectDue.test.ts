import { describe, it, expect } from 'vitest';
import { selectDueEntries } from '../src/selectDue';
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

describe('selectDueEntries', () => {
  it('includes scheduled entries with date equal to today', () => {
    const queue = [entry({ id: 'a', date: '2026-09-06' })];
    expect(selectDueEntries(queue, '2026-09-06').map(e => e.id)).toEqual(['a']);
  });

  it('includes scheduled entries with date before today (missed cron run)', () => {
    const queue = [entry({ id: 'a', date: '2026-09-01' })];
    expect(selectDueEntries(queue, '2026-09-06').map(e => e.id)).toEqual(['a']);
  });

  it('excludes scheduled entries with a future date', () => {
    const queue = [entry({ id: 'a', date: '2026-09-10' })];
    expect(selectDueEntries(queue, '2026-09-06')).toEqual([]);
  });

  it('excludes entries that are not status "scheduled"', () => {
    const queue = [
      entry({ id: 'a', date: '2026-09-01', status: 'published' }),
      entry({ id: 'b', date: '2026-09-01', status: 'failed' }),
    ];
    expect(selectDueEntries(queue, '2026-09-06')).toEqual([]);
  });
});
