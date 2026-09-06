import { Env } from './types';
import { isAuthorized } from './auth';
import { buildQueueEntry, appendEntry } from './queue';
import { uploadVideoAsset, readQueueFile, writeQueueFile, GitHubConfig } from './github';
import { generateCaption } from './caption';
import { listInstagramAccounts } from './zernioAccounts';

const QUEUE_PATH = 'queue.json';

function jsonResponse(body: unknown, status = 200): Response {
  const response = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  response.headers.set('Access-Control-Allow-Origin', '*');
  return response;
}

function githubConfigFor(env: Env): GitHubConfig {
  return { token: env.GITHUB_TOKEN, owner: env.GITHUB_OWNER, repo: env.GITHUB_REPO };
}

async function handleAccounts(request: Request, env: Env): Promise<Response> {
  const password = request.headers.get('x-app-password');
  if (!isAuthorized(password, env.APP_PASSWORD)) return jsonResponse({ error: 'unauthorized' }, 401);

  const accounts = await listInstagramAccounts(env.ZERNIO_API_KEY);
  return jsonResponse({ accounts });
}

async function handleCaption(request: Request, env: Env): Promise<Response> {
  const body = (await request.json()) as { password: string; hint: string; frame_base64: string };
  if (!isAuthorized(body.password, env.APP_PASSWORD)) return jsonResponse({ error: 'unauthorized' }, 401);

  const caption = await generateCaption({
    apiKey: env.ANTHROPIC_API_KEY,
    frameBase64: body.frame_base64,
    hint: body.hint,
  });
  return jsonResponse({ caption });
}

async function handleSchedule(request: Request, env: Env): Promise<Response> {
  const form = await request.formData();
  const password = form.get('password');
  if (!isAuthorized(typeof password === 'string' ? password : null, env.APP_PASSWORD)) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }

  const video = form.get('video');
  const accountId = form.get('account_id');
  const date = form.get('date');
  const caption = form.get('caption');
  if (!(video instanceof File) || typeof accountId !== 'string' || typeof date !== 'string' || typeof caption !== 'string') {
    return jsonResponse({ error: 'missing_fields' }, 400);
  }

  const githubConfig = githubConfigFor(env);
  const fileBytes = await video.arrayBuffer();
  const fileName = `${Date.now()}_${video.name}`;
  const videoUrl = await uploadVideoAsset(githubConfig, fileName, fileBytes, video.type || 'video/mp4');

  const { content: existingQueue, sha } = await readQueueFile(githubConfig, QUEUE_PATH);
  const entry = buildQueueEntry(
    { video_url: videoUrl, account_id: accountId, date, caption },
    crypto.randomUUID(),
    new Date().toISOString()
  );
  const nextQueue = appendEntry(existingQueue as any, entry);
  await writeQueueFile(githubConfig, QUEUE_PATH, nextQueue, sha, `Schedule Instagram post for ${date}`);

  return jsonResponse({ entry });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type,x-app-password',
        },
      });
    }

    try {
      if (url.pathname === '/accounts' && request.method === 'GET') {
        return await handleAccounts(request, env);
      }
      if (url.pathname === '/caption' && request.method === 'POST') {
        return await handleCaption(request, env);
      }
      if (url.pathname === '/schedule' && request.method === 'POST') {
        return await handleSchedule(request, env);
      }
      return jsonResponse({ error: 'not_found' }, 404);
    } catch (err) {
      return jsonResponse({ error: (err as Error).message }, 500);
    }
  },
};
