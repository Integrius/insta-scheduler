import { QueueEntry } from './types';

export interface NewEntryInput {
  video_url: string;
  account_id: string;
  date: string;
  caption: string;
}

export function buildQueueEntry(input: NewEntryInput, id: string, createdAt: string): QueueEntry {
  return {
    id,
    video_url: input.video_url,
    account_id: input.account_id,
    platform: 'instagram',
    date: input.date,
    caption: input.caption,
    status: 'scheduled',
    created_at: createdAt,
  };
}

export function appendEntry(queue: QueueEntry[], entry: QueueEntry): QueueEntry[] {
  return [...queue, entry];
}
