import { QueueEntry } from './types';

export function selectDueEntries(queue: QueueEntry[], today: string): QueueEntry[] {
  return queue.filter(entry => entry.status === 'scheduled' && entry.date <= today);
}
