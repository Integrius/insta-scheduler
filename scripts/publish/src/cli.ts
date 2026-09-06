import { runDailyPublish } from './index';

async function main(): Promise<void> {
  const apiKey = process.env.ZERNIO_API_KEY;
  if (!apiKey) {
    throw new Error('ZERNIO_API_KEY environment variable is required');
  }

  const today = new Date().toISOString().slice(0, 10);
  const result = await runDailyPublish({
    queuePath: 'queue.json',
    historyPath: 'history.json',
    apiKey,
    today,
  });

  console.log(`Published: ${result.published}, Failed: ${result.failed}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
