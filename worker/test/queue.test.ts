import { describe, it, expect } from 'vitest';
import { buildQueueEntry, appendEntry } from '../src/queue';

describe('buildQueueEntry', () => {
  it('builds a scheduled entry with the given id and timestamp', () => {
    const entry = buildQueueEntry(
      {
        video_url: 'https://example.com/video.mp4',
        account_id: 'acc-1',
        date: '2026-09-10',
        caption: 'Hello',
      },
      'uuid-1',
      '2026-09-06T15:00:00.000Z'
    );

    expect(entry).toEqual({
      id: 'uuid-1',
      video_url: 'https://example.com/video.mp4',
      account_id: 'acc-1',
      platform: 'instagram',
      date: '2026-09-10',
      caption: 'Hello',
      status: 'scheduled',
      created_at: '2026-09-06T15:00:00.000Z',
    });
  });
});

describe('appendEntry', () => {
  it('returns a new array with the entry appended, without mutating the original', () => {
    const original = [
      buildQueueEntry(
        { video_url: 'a', account_id: 'acc-1', date: '2026-09-06', caption: 'a' },
        'a',
        '2026-09-01T00:00:00.000Z'
      ),
    ];
    const entry = buildQueueEntry(
      { video_url: 'b', account_id: 'acc-1', date: '2026-09-07', caption: 'b' },
      'b',
      '2026-09-06T00:00:00.000Z'
    );

    const result = appendEntry(original, entry);

    expect(result).toHaveLength(2);
    expect(original).toHaveLength(1);
    expect(result[1].id).toBe('b');
  });
});
