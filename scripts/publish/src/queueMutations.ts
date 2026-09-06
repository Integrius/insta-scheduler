import { QueueEntry } from './types';

export interface PublishResult {
  id: string;
  outcome: 'published' | 'failed';
  publishedAt?: string;
  error?: string;
}

export function markPublished(entry: QueueEntry, publishedAt: string): QueueEntry {
  return { ...entry, status: 'published', published_at: publishedAt };
}

export function markFailed(entry: QueueEntry, error: string): QueueEntry {
  return { ...entry, status: 'failed', error };
}

export function applyResults(
  queue: QueueEntry[],
  history: QueueEntry[],
  results: PublishResult[]
): { queue: QueueEntry[]; history: QueueEntry[] } {
  const resultById = new Map(results.map(result => [result.id, result]));
  const nextQueue: QueueEntry[] = [];
  const nextHistory: QueueEntry[] = [...history];

  for (const entry of queue) {
    const result = resultById.get(entry.id);
    if (!result) {
      nextQueue.push(entry);
      continue;
    }
    if (result.outcome === 'published') {
      nextHistory.push(markPublished(entry, result.publishedAt as string));
    } else {
      nextQueue.push(markFailed(entry, result.error as string));
    }
  }

  return { queue: nextQueue, history: nextHistory };
}
