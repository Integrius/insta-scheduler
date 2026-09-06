import { readFile, writeFile } from 'node:fs/promises';
import { QueueEntry } from './types';
import { selectDueEntries } from './selectDue';
import { applyResults, PublishResult } from './queueMutations';
import { publishInstagramPost } from './zernioClient';

export interface RunOptions {
  queuePath: string;
  historyPath: string;
  apiKey: string;
  today: string;
  fetchImpl?: typeof fetch;
}

export async function runDailyPublish(
  options: RunOptions
): Promise<{ published: number; failed: number }> {
  const { queuePath, historyPath, apiKey, today, fetchImpl } = options;

  const queue: QueueEntry[] = JSON.parse(await readFile(queuePath, 'utf-8'));
  const history: QueueEntry[] = JSON.parse(await readFile(historyPath, 'utf-8'));

  const due = selectDueEntries(queue, today);
  const results: PublishResult[] = [];

  for (const entry of due) {
    try {
      await publishInstagramPost({
        apiKey,
        accountId: entry.account_id,
        videoUrl: entry.video_url,
        caption: entry.caption,
        fetchImpl,
      });
      results.push({ id: entry.id, outcome: 'published', publishedAt: new Date().toISOString() });
    } catch (err) {
      results.push({ id: entry.id, outcome: 'failed', error: (err as Error).message });
    }
  }

  const { queue: nextQueue, history: nextHistory } = applyResults(queue, history, results);

  await writeFile(queuePath, `${JSON.stringify(nextQueue, null, 2)}\n`);
  await writeFile(historyPath, `${JSON.stringify(nextHistory, null, 2)}\n`);

  return {
    published: results.filter(r => r.outcome === 'published').length,
    failed: results.filter(r => r.outcome === 'failed').length,
  };
}
