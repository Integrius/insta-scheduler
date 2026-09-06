# Insta Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a self-hosted (GitHub Pages + Cloudflare Worker + GitHub Actions) tool that lets Hans pick a video, an Instagram account, and a publish date from a web form, gets an AI-generated caption to review, and has the post go out automatically on the chosen day via the Zernio API.

**Architecture:** A static frontend (GitHub Pages) posts to a Cloudflare Worker, which is the only component holding secrets. The Worker stores videos as GitHub Release assets and appends scheduling entries to `queue.json` in the repo. A daily GitHub Actions cron job reads `queue.json`, publishes anything due today via the Zernio REST API (`https://zernio.com/api/v1`), and moves finished entries to `history.json`.

**Tech Stack:** TypeScript throughout. Cloudflare Workers (no framework) for the backend. Plain HTML/CSS/JS (ES modules, no framework) for the frontend. Node.js 20 + plain `tsc` for the Actions publish script. Vitest for all unit tests.

## Global Constraints

- Single user, single password — no multi-user auth (per spec, "Segurança").
- Only Instagram via Zernio for now — no other platforms (per spec, "Fora de escopo").
- A failed publish attempt stays `failed` in `queue.json` for manual retry — the cron never re-attempts it automatically (per spec, "Fora de escopo" and "Tratamento de erros").
- No video editing features — videos arrive ready to post (per spec, "Fora de escopo").
- Zernio API base URL: `https://zernio.com/api/v1`, auth header `Authorization: Bearer <ZERNIO_API_KEY>` (confirmed from Zernio's own docs).
- Repo: new dedicated repo, local path `D:\Users\Hans\Projetos\insta-scheduler`, already `git init`-ed with the design spec committed as the first commit.

---

## File Structure

```
insta-scheduler/
├── queue.json                        # [] initially — scheduled posts
├── history.json                      # [] initially — published/failed posts
├── .gitignore
├── README.md
├── scripts/publish/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── types.ts
│   │   ├── selectDue.ts
│   │   ├── queueMutations.ts
│   │   ├── zernioClient.ts
│   │   ├── index.ts
│   │   └── cli.ts
│   └── test/
│       ├── selectDue.test.ts
│       ├── queueMutations.test.ts
│       ├── zernioClient.test.ts
│       └── index.test.ts
├── worker/
│   ├── package.json
│   ├── tsconfig.json
│   ├── wrangler.toml
│   ├── src/
│   │   ├── types.ts
│   │   ├── auth.ts
│   │   ├── queue.ts
│   │   ├── github.ts
│   │   ├── caption.ts
│   │   ├── zernioAccounts.ts
│   │   └── index.ts
│   └── test/
│       ├── auth.test.ts
│       ├── queue.test.ts
│       ├── github.test.ts
│       ├── caption.test.ts
│       ├── zernioAccounts.test.ts
│       └── index.test.ts
├── frontend/
│   ├── index.html
│   ├── style.css
│   ├── formValidation.js
│   ├── formValidation.test.js
│   └── app.js
└── .github/workflows/
    ├── daily-publish.yml
    └── pages-deploy.yml
```

---

### Task 1: Repo scaffolding

**Files:**
- Create: `queue.json`
- Create: `history.json`
- Create: `.gitignore`
- Create: `README.md`

**Interfaces:**
- Produces: `queue.json` and `history.json` as the two data files every later task reads/writes. Both start as `[]`.

- [ ] **Step 1: Create the seed data files**

`queue.json`:
```json
[]
```

`history.json`:
```json
[]
```

- [ ] **Step 2: Create `.gitignore`**

```
node_modules/
dist/
.wrangler/
*.log
.DS_Store
```

- [ ] **Step 3: Create a minimal `README.md` stub**

```markdown
# Insta Scheduler

Agenda publicações de vídeo no Instagram (via Zernio) a partir de um
formulário web, com legenda gerada por IA e publicação automática diária.

Setup completo: ver a seção "Configuração" mais abaixo (adicionada ao final
deste plano de implementação).
```

- [ ] **Step 4: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add queue.json history.json .gitignore README.md
git commit -m "chore: scaffold repo with empty queue/history"
```

---

### Task 2: `scripts/publish` — types and `selectDue`

**Files:**
- Create: `scripts/publish/package.json`
- Create: `scripts/publish/tsconfig.json`
- Create: `scripts/publish/src/types.ts`
- Create: `scripts/publish/src/selectDue.ts`
- Test: `scripts/publish/test/selectDue.test.ts`

**Interfaces:**
- Produces: `QueueEntry` interface (used by every file in `scripts/publish` and mirrored in `worker/src/types.ts`):
  ```ts
  export interface QueueEntry {
    id: string;
    video_url: string;
    account_id: string;
    platform: string;
    date: string; // "YYYY-MM-DD"
    caption: string;
    status: 'scheduled' | 'published' | 'failed';
    created_at: string; // ISO timestamp
    published_at?: string; // ISO timestamp, only when status === 'published'
    error?: string; // only when status === 'failed'
  }
  ```
- Produces: `selectDueEntries(queue: QueueEntry[], today: string): QueueEntry[]`

- [ ] **Step 1: Create `scripts/publish/package.json`**

```json
{
  "name": "insta-scheduler-publish",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "build": "tsc -p tsconfig.json",
    "test": "vitest run"
  },
  "devDependencies": {
    "typescript": "^5.5.4",
    "vitest": "^2.0.5",
    "@types/node": "^20.14.10"
  }
}
```

- [ ] **Step 2: Create `scripts/publish/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "Node",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler/scripts/publish
npm install
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
export interface QueueEntry {
  id: string;
  video_url: string;
  account_id: string;
  platform: string;
  date: string;
  caption: string;
  status: 'scheduled' | 'published' | 'failed';
  created_at: string;
  published_at?: string;
  error?: string;
}
```

- [ ] **Step 5: Write the failing test for `selectDueEntries`**

`scripts/publish/test/selectDue.test.ts`:
```ts
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
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test` (from `scripts/publish`)
Expected: FAIL — `Cannot find module '../src/selectDue'`

- [ ] **Step 7: Implement `src/selectDue.ts`**

```ts
import { QueueEntry } from './types';

export function selectDueEntries(queue: QueueEntry[], today: string): QueueEntry[] {
  return queue.filter(entry => entry.status === 'scheduled' && entry.date <= today);
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test` (from `scripts/publish`)
Expected: PASS — 4 tests green

- [ ] **Step 9: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add scripts/publish/package.json scripts/publish/package-lock.json scripts/publish/tsconfig.json scripts/publish/src/types.ts scripts/publish/src/selectDue.ts scripts/publish/test/selectDue.test.ts
git commit -m "feat(publish): add QueueEntry type and selectDueEntries"
```

---

### Task 3: `scripts/publish` — `queueMutations`

**Files:**
- Create: `scripts/publish/src/queueMutations.ts`
- Test: `scripts/publish/test/queueMutations.test.ts`

**Interfaces:**
- Consumes: `QueueEntry` from Task 2.
- Produces:
  ```ts
  export interface PublishResult {
    id: string;
    outcome: 'published' | 'failed';
    publishedAt?: string;
    error?: string;
  }

  export function markPublished(entry: QueueEntry, publishedAt: string): QueueEntry;
  export function markFailed(entry: QueueEntry, error: string): QueueEntry;
  export function applyResults(
    queue: QueueEntry[],
    history: QueueEntry[],
    results: PublishResult[]
  ): { queue: QueueEntry[]; history: QueueEntry[] };
  ```

- [ ] **Step 1: Write the failing tests**

`scripts/publish/test/queueMutations.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `scripts/publish`)
Expected: FAIL — `Cannot find module '../src/queueMutations'`

- [ ] **Step 3: Implement `src/queueMutations.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `scripts/publish`)
Expected: PASS — all tests green

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add scripts/publish/src/queueMutations.ts scripts/publish/test/queueMutations.test.ts
git commit -m "feat(publish): add queueMutations for moving entries between queue and history"
```

---

### Task 4: `scripts/publish` — `zernioClient`

**Files:**
- Create: `scripts/publish/src/zernioClient.ts`
- Test: `scripts/publish/test/zernioClient.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface PublishParams {
    apiKey: string;
    accountId: string;
    videoUrl: string;
    caption: string;
    fetchImpl?: typeof fetch;
  }
  export async function publishInstagramPost(params: PublishParams): Promise<void>;
  ```

- [ ] **Step 1: Write the failing tests**

`scripts/publish/test/zernioClient.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { publishInstagramPost } from '../src/zernioClient';

describe('publishInstagramPost', () => {
  it('POSTs to https://zernio.com/api/v1/posts with the expected body and auth header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });

    await publishInstagramPost({
      apiKey: 'sk_test',
      accountId: 'acc-1',
      videoUrl: 'https://example.com/video.mp4',
      caption: 'Hello world #test',
      fetchImpl,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://zernio.com/api/v1/posts');
    expect(options.method).toBe('POST');
    expect(options.headers.Authorization).toBe('Bearer sk_test');
    expect(JSON.parse(options.body)).toEqual({
      content: 'Hello world #test',
      mediaItems: [{ type: 'video', url: 'https://example.com/video.mp4' }],
      platforms: [{ platform: 'instagram', accountId: 'acc-1' }],
      publishNow: true,
    });
  });

  it('throws with the response body when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => 'account not found',
    });

    await expect(
      publishInstagramPost({
        apiKey: 'sk_test',
        accountId: 'acc-1',
        videoUrl: 'https://example.com/video.mp4',
        caption: 'x',
        fetchImpl,
      })
    ).rejects.toThrow('Zernio publish failed (400): account not found');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `scripts/publish`)
Expected: FAIL — `Cannot find module '../src/zernioClient'`

- [ ] **Step 3: Implement `src/zernioClient.ts`**

```ts
const ZERNIO_API_BASE = 'https://zernio.com/api/v1';

export interface PublishParams {
  apiKey: string;
  accountId: string;
  videoUrl: string;
  caption: string;
  fetchImpl?: typeof fetch;
}

export async function publishInstagramPost(params: PublishParams): Promise<void> {
  const { apiKey, accountId, videoUrl, caption, fetchImpl = fetch } = params;

  const res = await fetchImpl(`${ZERNIO_API_BASE}/posts`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      content: caption,
      mediaItems: [{ type: 'video', url: videoUrl }],
      platforms: [{ platform: 'instagram', accountId }],
      publishNow: true,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zernio publish failed (${res.status}): ${text}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `scripts/publish`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add scripts/publish/src/zernioClient.ts scripts/publish/test/zernioClient.test.ts
git commit -m "feat(publish): add Zernio client for publishing Instagram posts"
```

---

### Task 5: `scripts/publish` — orchestration (`index.ts`) and CLI

**Files:**
- Create: `scripts/publish/src/index.ts`
- Create: `scripts/publish/src/cli.ts`
- Test: `scripts/publish/test/index.test.ts`

**Interfaces:**
- Consumes: `selectDueEntries` (Task 2), `applyResults`/`PublishResult` (Task 3), `publishInstagramPost` (Task 4).
- Produces:
  ```ts
  export interface RunOptions {
    queuePath: string;
    historyPath: string;
    apiKey: string;
    today: string;
    fetchImpl?: typeof fetch;
  }
  export async function runDailyPublish(options: RunOptions): Promise<{ published: number; failed: number }>;
  ```

- [ ] **Step 1: Write the failing test**

`scripts/publish/test/index.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` (from `scripts/publish`)
Expected: FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Implement `src/index.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` (from `scripts/publish`)
Expected: PASS

- [ ] **Step 5: Create the CLI entry point (no test — thin wrapper exercised manually in Task 6)**

`scripts/publish/src/cli.ts`:
```ts
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
```

- [ ] **Step 6: Build and smoke-test the CLI locally**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler/scripts/publish
npm run build
cd /d/Users/Hans/Projetos/insta-scheduler
ZERNIO_API_KEY=dummy node scripts/publish/dist/cli.js
```
Expected: prints `Published: 0, Failed: 0` (queue.json is still `[]` at this point in the plan) and exits 0.

- [ ] **Step 7: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add scripts/publish/src/index.ts scripts/publish/src/cli.ts scripts/publish/test/index.test.ts
git commit -m "feat(publish): add runDailyPublish orchestration and CLI entry point"
```

---

### Task 6: Daily publish GitHub Actions workflow

**Files:**
- Create: `.github/workflows/daily-publish.yml`

**Interfaces:**
- Consumes: `scripts/publish` (Tasks 2–5), repository secret `ZERNIO_API_KEY`.

- [ ] **Step 1: Create the workflow**

`.github/workflows/daily-publish.yml`:
```yaml
name: Daily Instagram Publish

on:
  schedule:
    - cron: '0 12 * * *'
  workflow_dispatch: {}

permissions:
  contents: write

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install publish script dependencies
        working-directory: scripts/publish
        run: npm install

      - name: Build publish script
        working-directory: scripts/publish
        run: npm run build

      - name: Run daily publish
        env:
          ZERNIO_API_KEY: ${{ secrets.ZERNIO_API_KEY }}
        run: node scripts/publish/dist/cli.js

      - name: Commit updated queue and history
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          git add queue.json history.json
          git diff --staged --quiet || git commit -m "chore: update publish queue [skip ci]"
          git push
```

- [ ] **Step 2: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add .github/workflows/daily-publish.yml
git commit -m "ci: add daily Instagram publish workflow"
```

*(This workflow can only be fully verified once the repo exists on GitHub with the `ZERNIO_API_KEY` secret set — that manual verification happens in Task 18.)*

---

### Task 7: `worker` — types and `auth`

**Files:**
- Create: `worker/package.json`
- Create: `worker/tsconfig.json`
- Create: `worker/src/types.ts`
- Create: `worker/src/auth.ts`
- Test: `worker/test/auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // worker/src/types.ts
  export interface QueueEntry { /* identical shape to scripts/publish/src/types.ts */ }
  export interface Env {
    APP_PASSWORD: string;
    GITHUB_TOKEN: string;
    GITHUB_OWNER: string;
    GITHUB_REPO: string;
    ANTHROPIC_API_KEY: string;
    ZERNIO_API_KEY: string;
  }

  // worker/src/auth.ts
  export function isAuthorized(provided: string | null, expected: string): boolean;
  ```

- [ ] **Step 1: Create `worker/package.json`**

```json
{
  "name": "insta-scheduler-worker",
  "private": true,
  "version": "1.0.0",
  "scripts": {
    "dev": "wrangler dev",
    "deploy": "wrangler deploy",
    "test": "vitest run"
  },
  "devDependencies": {
    "wrangler": "^3.78.0",
    "vitest": "^2.0.5",
    "typescript": "^5.5.4",
    "@cloudflare/workers-types": "^4.20240815.0"
  }
}
```

- [ ] **Step 2: Create `worker/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "types": ["@cloudflare/workers-types"],
    "strict": true,
    "skipLibCheck": true,
    "noEmit": true
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Install dependencies**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler/worker
npm install
```

- [ ] **Step 4: Create `src/types.ts`**

```ts
export interface QueueEntry {
  id: string;
  video_url: string;
  account_id: string;
  platform: string;
  date: string;
  caption: string;
  status: 'scheduled' | 'published' | 'failed';
  created_at: string;
  published_at?: string;
  error?: string;
}

export interface Env {
  APP_PASSWORD: string;
  GITHUB_TOKEN: string;
  GITHUB_OWNER: string;
  GITHUB_REPO: string;
  ANTHROPIC_API_KEY: string;
  ZERNIO_API_KEY: string;
}
```

- [ ] **Step 5: Write the failing test for `isAuthorized`**

`worker/test/auth.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { isAuthorized } from '../src/auth';

describe('isAuthorized', () => {
  it('returns true when the provided password matches', () => {
    expect(isAuthorized('correct-horse', 'correct-horse')).toBe(true);
  });

  it('returns false when the password does not match', () => {
    expect(isAuthorized('wrong', 'correct-horse')).toBe(false);
  });

  it('returns false when no password was provided', () => {
    expect(isAuthorized(null, 'correct-horse')).toBe(false);
  });

  it('returns false for an empty string password', () => {
    expect(isAuthorized('', 'correct-horse')).toBe(false);
  });
});
```

- [ ] **Step 6: Run the test to verify it fails**

Run: `npm test` (from `worker`)
Expected: FAIL — `Cannot find module '../src/auth'`

- [ ] **Step 7: Implement `src/auth.ts`**

```ts
export function isAuthorized(provided: string | null, expected: string): boolean {
  return typeof provided === 'string' && provided.length > 0 && provided === expected;
}
```

- [ ] **Step 8: Run the test to verify it passes**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 9: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/package.json worker/package-lock.json worker/tsconfig.json worker/src/types.ts worker/src/auth.ts worker/test/auth.test.ts
git commit -m "feat(worker): add Env/QueueEntry types and password auth check"
```

---

### Task 8: `worker` — `queue.ts`

**Files:**
- Create: `worker/src/queue.ts`
- Test: `worker/test/queue.test.ts`

**Interfaces:**
- Consumes: `QueueEntry` from Task 7.
- Produces:
  ```ts
  export interface NewEntryInput {
    video_url: string;
    account_id: string;
    date: string;
    caption: string;
  }
  export function buildQueueEntry(input: NewEntryInput, id: string, createdAt: string): QueueEntry;
  export function appendEntry(queue: QueueEntry[], entry: QueueEntry): QueueEntry[];
  ```

- [ ] **Step 1: Write the failing tests**

`worker/test/queue.test.ts`:
```ts
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
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `worker`)
Expected: FAIL — `Cannot find module '../src/queue'`

- [ ] **Step 3: Implement `src/queue.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/src/queue.ts worker/test/queue.test.ts
git commit -m "feat(worker): add buildQueueEntry and appendEntry helpers"
```

---

### Task 9: `worker` — GitHub Release video upload

**Files:**
- Create: `worker/src/github.ts` (this task adds the release-upload half; Task 10 adds the queue-file half to the same file)
- Test: `worker/test/github.test.ts` (this task adds the release-upload tests; Task 10 appends to the same file)

**Interfaces:**
- Produces:
  ```ts
  export interface GitHubConfig {
    token: string;
    owner: string;
    repo: string;
    fetchImpl?: typeof fetch;
  }
  export async function uploadVideoAsset(
    config: GitHubConfig,
    fileName: string,
    fileBytes: ArrayBuffer,
    contentType: string
  ): Promise<string>; // returns the asset's public download URL
  ```

- [ ] **Step 1: Write the failing tests**

`worker/test/github.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { uploadVideoAsset } from '../src/github';

const config = { token: 'gh_token', owner: 'hans', repo: 'insta-scheduler' };

describe('uploadVideoAsset', () => {
  it('reuses the existing "media" release when present, and uploads the asset to it', async () => {
    const fetchImpl = vi.fn()
      // GET releases/tags/media -> found
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, upload_url: 'https://uploads.github.com/repos/hans/insta-scheduler/releases/1/assets{?name,label}' }),
      })
      // POST upload asset -> created
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ browser_download_url: 'https://github.com/hans/insta-scheduler/releases/download/media/video.mp4' }),
      });

    const url = await uploadVideoAsset(
      { ...config, fetchImpl },
      'video.mp4',
      new ArrayBuffer(8),
      'video/mp4'
    );

    expect(url).toBe('https://github.com/hans/insta-scheduler/releases/download/media/video.mp4');
    expect(fetchImpl).toHaveBeenCalledTimes(2);

    const [uploadUrl, uploadOptions] = fetchImpl.mock.calls[1];
    expect(uploadUrl).toBe('https://uploads.github.com/repos/hans/insta-scheduler/releases/1/assets?name=video.mp4');
    expect(uploadOptions.headers['Content-Type']).toBe('video/mp4');
  });

  it('creates the "media" release first when it does not exist yet', async () => {
    const fetchImpl = vi.fn()
      // GET releases/tags/media -> not found
      .mockResolvedValueOnce({ ok: false, status: 404, text: async () => 'Not Found' })
      // POST create release -> created
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ id: 2, upload_url: 'https://uploads.github.com/repos/hans/insta-scheduler/releases/2/assets{?name,label}' }),
      })
      // POST upload asset -> created
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ browser_download_url: 'https://github.com/hans/insta-scheduler/releases/download/media/video2.mp4' }),
      });

    const url = await uploadVideoAsset(
      { ...config, fetchImpl },
      'video2.mp4',
      new ArrayBuffer(8),
      'video/mp4'
    );

    expect(url).toBe('https://github.com/hans/insta-scheduler/releases/download/media/video2.mp4');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('throws when the asset upload request fails', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ id: 1, upload_url: 'https://uploads.github.com/repos/hans/insta-scheduler/releases/1/assets{?name,label}' }),
      })
      .mockResolvedValueOnce({ ok: false, status: 422, text: async () => 'asset already exists' });

    await expect(
      uploadVideoAsset({ ...config, fetchImpl }, 'video.mp4', new ArrayBuffer(8), 'video/mp4')
    ).rejects.toThrow('Failed to upload video asset (422): asset already exists');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `worker`)
Expected: FAIL — `Cannot find module '../src/github'`

- [ ] **Step 3: Implement the release-upload half of `src/github.ts`**

```ts
export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}

const GITHUB_API = 'https://api.github.com';
const MEDIA_RELEASE_TAG = 'media';

interface ReleaseInfo {
  id: number;
  upload_url: string;
}

async function getOrCreateMediaRelease(config: GitHubConfig): Promise<ReleaseInfo> {
  const { token, owner, repo, fetchImpl = fetch } = config;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
  };

  const existing = await fetchImpl(
    `${GITHUB_API}/repos/${owner}/${repo}/releases/tags/${MEDIA_RELEASE_TAG}`,
    { headers }
  );
  if (existing.ok) {
    return (await existing.json()) as ReleaseInfo;
  }

  const created = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/releases`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tag_name: MEDIA_RELEASE_TAG,
      name: 'Media assets',
      draft: false,
      prerelease: false,
    }),
  });
  if (!created.ok) {
    throw new Error(`Failed to create media release (${created.status}): ${await created.text()}`);
  }
  return (await created.json()) as ReleaseInfo;
}

export async function uploadVideoAsset(
  config: GitHubConfig,
  fileName: string,
  fileBytes: ArrayBuffer,
  contentType: string
): Promise<string> {
  const { token, fetchImpl = fetch } = config;
  const release = await getOrCreateMediaRelease(config);
  const uploadUrl = release.upload_url.replace('{?name,label}', `?name=${encodeURIComponent(fileName)}`);

  const res = await fetchImpl(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': contentType,
    },
    body: fileBytes,
  });

  if (!res.ok) {
    throw new Error(`Failed to upload video asset (${res.status}): ${await res.text()}`);
  }

  const asset = (await res.json()) as { browser_download_url: string };
  return asset.browser_download_url;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/src/github.ts worker/test/github.test.ts
git commit -m "feat(worker): upload videos as GitHub Release assets"
```

---

### Task 10: `worker` — `queue.json` read/write via GitHub Contents API

**Files:**
- Modify: `worker/src/github.ts` (append to the file from Task 9)
- Modify: `worker/test/github.test.ts` (append to the file from Task 9)

**Interfaces:**
- Consumes: `GitHubConfig` from Task 9.
- Produces:
  ```ts
  export async function readQueueFile(
    config: GitHubConfig,
    path: string
  ): Promise<{ content: unknown[]; sha: string | null }>;
  export async function writeQueueFile(
    config: GitHubConfig,
    path: string,
    content: unknown[],
    sha: string | null,
    message: string
  ): Promise<void>;
  ```

- [ ] **Step 1: Append the failing tests to `worker/test/github.test.ts`**

Add to the bottom of the existing `describe` blocks in `worker/test/github.test.ts`:
```ts
import { readQueueFile, writeQueueFile } from '../src/github';

describe('readQueueFile', () => {
  it('decodes base64 content and returns it with the file sha', async () => {
    const encoded = btoa(JSON.stringify([{ id: 'a' }]));
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: encoded, sha: 'sha-1' }),
    });

    const result = await readQueueFile({ ...config, fetchImpl }, 'queue.json');

    expect(result).toEqual({ content: [{ id: 'a' }], sha: 'sha-1' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.github.com/repos/hans/insta-scheduler/contents/queue.json',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer gh_token' }) })
    );
  });

  it('returns an empty array with a null sha when the file does not exist yet', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => 'Not Found' });

    const result = await readQueueFile({ ...config, fetchImpl }, 'queue.json');

    expect(result).toEqual({ content: [], sha: null });
  });
});

describe('writeQueueFile', () => {
  it('PUTs base64-encoded content with the sha for an update', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });

    await writeQueueFile({ ...config, fetchImpl }, 'queue.json', [{ id: 'a' }], 'sha-1', 'Schedule post');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/hans/insta-scheduler/contents/queue.json');
    expect(options.method).toBe('PUT');
    const body = JSON.parse(options.body);
    expect(body.sha).toBe('sha-1');
    expect(body.message).toBe('Schedule post');
    expect(JSON.parse(atob(body.content))).toEqual([{ id: 'a' }]);
  });

  it('omits sha when creating the file for the first time', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, status: 201, json: async () => ({}) });

    await writeQueueFile({ ...config, fetchImpl }, 'queue.json', [{ id: 'a' }], null, 'Create queue');

    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.sha).toBeUndefined();
  });

  it('throws when the write fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 409, text: async () => 'sha mismatch' });

    await expect(
      writeQueueFile({ ...config, fetchImpl }, 'queue.json', [], 'sha-1', 'msg')
    ).rejects.toThrow('Failed to write queue.json (409): sha mismatch');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `worker`)
Expected: FAIL — `readQueueFile`/`writeQueueFile` are not exported yet

- [ ] **Step 3: Append the implementation to `worker/src/github.ts`**

```ts
export async function readQueueFile(
  config: GitHubConfig,
  path: string
): Promise<{ content: unknown[]; sha: string | null }> {
  const { token, owner, repo, fetchImpl = fetch } = config;

  const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  });

  if (res.status === 404) {
    return { content: [], sha: null };
  }
  if (!res.ok) {
    throw new Error(`Failed to read ${path} (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { content: string; sha: string };
  const decoded = atob(data.content.replace(/\n/g, ''));
  return { content: JSON.parse(decoded), sha: data.sha };
}

export async function writeQueueFile(
  config: GitHubConfig,
  path: string,
  content: unknown[],
  sha: string | null,
  message: string
): Promise<void> {
  const { token, owner, repo, fetchImpl = fetch } = config;
  const encoded = btoa(JSON.stringify(content, null, 2) + '\n');

  const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/contents/${path}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message, content: encoded, sha: sha ?? undefined }),
  });

  if (!res.ok) {
    throw new Error(`Failed to write ${path} (${res.status}): ${await res.text()}`);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/src/github.ts worker/test/github.test.ts
git commit -m "feat(worker): read and write queue.json via the GitHub Contents API"
```

---

### Task 11: `worker` — `caption.ts` (Anthropic caption generation)

**Files:**
- Create: `worker/src/caption.ts`
- Test: `worker/test/caption.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CaptionParams {
    apiKey: string;
    frameBase64: string;
    hint: string;
    fetchImpl?: typeof fetch;
  }
  export async function generateCaption(params: CaptionParams): Promise<string>;
  ```

- [ ] **Step 1: Write the failing tests**

`worker/test/caption.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { generateCaption } from '../src/caption';

describe('generateCaption', () => {
  it('sends the frame and hint to Anthropic and returns the trimmed caption text', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [{ type: 'text', text: '  Legenda gerada  #bike  ' }] }),
    });

    const caption = await generateCaption({
      apiKey: 'sk-ant-test',
      frameBase64: 'ZmFrZS1mcmFtZQ==',
      hint: 'bike amarela',
      fetchImpl,
    });

    expect(caption).toBe('Legenda gerada  #bike');
    const [url, options] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(options.headers['x-api-key']).toBe('sk-ant-test');
    const body = JSON.parse(options.body);
    expect(body.messages[0].content[0]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/jpeg', data: 'ZmFrZS1mcmFtZQ==' },
    });
  });

  it('throws when Anthropic returns no text block', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    });

    await expect(
      generateCaption({ apiKey: 'sk-ant-test', frameBase64: 'x', hint: '', fetchImpl })
    ).rejects.toThrow('Anthropic response did not include a text block');
  });

  it('throws with the response body when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid key' });

    await expect(
      generateCaption({ apiKey: 'bad-key', frameBase64: 'x', hint: '', fetchImpl })
    ).rejects.toThrow('Anthropic caption generation failed (401): invalid key');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `worker`)
Expected: FAIL — `Cannot find module '../src/caption'`

- [ ] **Step 3: Implement `src/caption.ts`**

```ts
export interface CaptionParams {
  apiKey: string;
  frameBase64: string;
  hint: string;
  fetchImpl?: typeof fetch;
}

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-sonnet-5';

export async function generateCaption(params: CaptionParams): Promise<string> {
  const { apiKey, frameBase64, hint, fetchImpl = fetch } = params;

  const promptText = hint
    ? `Write an Instagram caption in Brazilian Portuguese with relevant hashtags for this video, based on this theme: "${hint}". Keep it short (2-4 lines) plus hashtags on a new line. Reply with only the caption text.`
    : `Write an Instagram caption in Brazilian Portuguese with relevant hashtags for this video, based on what you see in the frame. Keep it short (2-4 lines) plus hashtags on a new line. Reply with only the caption text.`;

  const res = await fetchImpl(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 300,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: frameBase64 } },
            { type: 'text', text: promptText },
          ],
        },
      ],
    }),
  });

  if (!res.ok) {
    throw new Error(`Anthropic caption generation failed (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as { content: { type: string; text?: string }[] };
  const textBlock = data.content.find(block => block.type === 'text');
  if (!textBlock?.text) {
    throw new Error('Anthropic response did not include a text block');
  }
  return textBlock.text.trim();
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/src/caption.ts worker/test/caption.test.ts
git commit -m "feat(worker): generate Instagram captions from a video frame via Anthropic"
```

---

### Task 12: `worker` — `zernioAccounts.ts`

**Files:**
- Create: `worker/src/zernioAccounts.ts`
- Test: `worker/test/zernioAccounts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface ZernioAccount {
    id: string;
    platform: string;
    username: string;
  }
  export async function listInstagramAccounts(
    apiKey: string,
    fetchImpl?: typeof fetch
  ): Promise<ZernioAccount[]>;
  ```

- [ ] **Step 1: Write the failing tests**

`worker/test/zernioAccounts.test.ts`:
```ts
import { describe, it, expect, vi } from 'vitest';
import { listInstagramAccounts } from '../src/zernioAccounts';

describe('listInstagramAccounts', () => {
  it('returns only instagram accounts, normalizing id/username fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        accounts: [
          { _id: 'a1', platform: 'instagram', username: 'kaka_rj59' },
          { _id: 'a2', platform: 'twitter', username: 'someone' },
        ],
      }),
    });

    const accounts = await listInstagramAccounts('sk_test', fetchImpl);

    expect(accounts).toEqual([{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://zernio.com/api/v1/accounts',
      { headers: { Authorization: 'Bearer sk_test' } }
    );
  });

  it('also handles a bare array response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }],
    });

    const accounts = await listInstagramAccounts('sk_test', fetchImpl);
    expect(accounts).toEqual([{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }]);
  });

  it('throws with the response body when the request fails', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'invalid key' });

    await expect(listInstagramAccounts('bad-key', fetchImpl)).rejects.toThrow(
      'Failed to list Zernio accounts (401): invalid key'
    );
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test` (from `worker`)
Expected: FAIL — `Cannot find module '../src/zernioAccounts'`

- [ ] **Step 3: Implement `src/zernioAccounts.ts`**

```ts
export interface ZernioAccount {
  id: string;
  platform: string;
  username: string;
}

interface RawAccount {
  _id?: string;
  id?: string;
  platform: string;
  username?: string;
  name?: string;
}

export async function listInstagramAccounts(
  apiKey: string,
  fetchImpl: typeof fetch = fetch
): Promise<ZernioAccount[]> {
  const res = await fetchImpl('https://zernio.com/api/v1/accounts', {
    headers: { Authorization: `Bearer ${apiKey}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to list Zernio accounts (${res.status}): ${await res.text()}`);
  }

  const data = (await res.json()) as RawAccount[] | { accounts: RawAccount[] };
  const rawAccounts: RawAccount[] = Array.isArray(data) ? data : data.accounts;

  return rawAccounts
    .filter(account => account.platform === 'instagram')
    .map(account => ({
      id: (account._id ?? account.id) as string,
      platform: account.platform,
      username: account.username ?? account.name ?? '',
    }));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/src/zernioAccounts.ts worker/test/zernioAccounts.test.ts
git commit -m "feat(worker): list connected Instagram accounts from Zernio"
```

*(Note for the implementer: once the Worker is deployed in Task 18, call `GET /accounts` for real and confirm the field names against the live Zernio response. If they differ from `_id`/`username`, adjust the mapping in this file and its test.)*

---

### Task 13: `worker` — router (`index.ts`) and `wrangler.toml`

**Files:**
- Create: `worker/src/index.ts`
- Create: `worker/wrangler.toml`
- Test: `worker/test/index.test.ts`

**Interfaces:**
- Consumes: `isAuthorized` (Task 7), `buildQueueEntry`/`appendEntry` (Task 8), `uploadVideoAsset`/`readQueueFile`/`writeQueueFile` (Tasks 9–10), `generateCaption` (Task 11), `listInstagramAccounts` (Task 12).
- Produces: the Worker's `fetch` handler, routes `GET /accounts`, `POST /caption`, `POST /schedule`.

- [ ] **Step 1: Write the failing tests**

`worker/test/index.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../src/zernioAccounts', () => ({
  listInstagramAccounts: vi.fn(),
}));
vi.mock('../src/caption', () => ({
  generateCaption: vi.fn(),
}));
vi.mock('../src/github', () => ({
  uploadVideoAsset: vi.fn(),
  readQueueFile: vi.fn(),
  writeQueueFile: vi.fn(),
}));

import worker from '../src/index';
import { listInstagramAccounts } from '../src/zernioAccounts';
import { generateCaption } from '../src/caption';
import { uploadVideoAsset, readQueueFile, writeQueueFile } from '../src/github';

const env = {
  APP_PASSWORD: 'secret',
  GITHUB_TOKEN: 'gh_token',
  GITHUB_OWNER: 'hans',
  GITHUB_REPO: 'insta-scheduler',
  ANTHROPIC_API_KEY: 'sk-ant',
  ZERNIO_API_KEY: 'sk-zernio',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('worker fetch handler', () => {
  it('rejects /accounts without the correct password', async () => {
    const request = new Request('https://worker.example/accounts', {
      headers: { 'x-app-password': 'wrong' },
    });
    const res = await worker.fetch(request, env as any);
    expect(res.status).toBe(401);
    expect(listInstagramAccounts).not.toHaveBeenCalled();
  });

  it('returns accounts for /accounts with the correct password', async () => {
    (listInstagramAccounts as any).mockResolvedValue([{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }]);

    const request = new Request('https://worker.example/accounts', {
      headers: { 'x-app-password': 'secret' },
    });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accounts: [{ id: 'a1', platform: 'instagram', username: 'kaka_rj59' }] });
  });

  it('rejects /caption without the correct password', async () => {
    const request = new Request('https://worker.example/caption', {
      method: 'POST',
      body: JSON.stringify({ password: 'wrong', hint: '', frame_base64: 'x' }),
    });
    const res = await worker.fetch(request, env as any);
    expect(res.status).toBe(401);
    expect(generateCaption).not.toHaveBeenCalled();
  });

  it('returns a generated caption for /caption with the correct password', async () => {
    (generateCaption as any).mockResolvedValue('Legenda gerada #bike');

    const request = new Request('https://worker.example/caption', {
      method: 'POST',
      body: JSON.stringify({ password: 'secret', hint: 'bike amarela', frame_base64: 'ZmFrZQ==' }),
    });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ caption: 'Legenda gerada #bike' });
  });

  it('schedules a post for /schedule with the correct password', async () => {
    (uploadVideoAsset as any).mockResolvedValue('https://github.com/hans/insta-scheduler/releases/download/media/video.mp4');
    (readQueueFile as any).mockResolvedValue({ content: [], sha: 'sha-1' });
    (writeQueueFile as any).mockResolvedValue(undefined);

    const form = new FormData();
    form.set('password', 'secret');
    form.set('account_id', 'acc-1');
    form.set('date', '2026-09-10');
    form.set('caption', 'Hello world');
    form.set('video', new File(['fake-bytes'], 'video.mp4', { type: 'video/mp4' }));

    const request = new Request('https://worker.example/schedule', { method: 'POST', body: form });
    const res = await worker.fetch(request, env as any);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entry.account_id).toBe('acc-1');
    expect(body.entry.date).toBe('2026-09-10');
    expect(body.entry.status).toBe('scheduled');
    expect(writeQueueFile).toHaveBeenCalledTimes(1);
  });

  it('returns 404 for an unknown route', async () => {
    const request = new Request('https://worker.example/unknown');
    const res = await worker.fetch(request, env as any);
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test` (from `worker`)
Expected: FAIL — `Cannot find module '../src/index'`

- [ ] **Step 3: Implement `src/index.ts`**

```ts
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test` (from `worker`)
Expected: PASS

- [ ] **Step 5: Create `worker/wrangler.toml`**

```toml
name = "insta-scheduler"
main = "src/index.ts"
compatibility_date = "2026-09-06"

[vars]
GITHUB_OWNER = "REPLACE_WITH_YOUR_GITHUB_USERNAME"
GITHUB_REPO = "insta-scheduler"
```

- [ ] **Step 6: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add worker/src/index.ts worker/test/index.test.ts worker/wrangler.toml
git commit -m "feat(worker): wire up /accounts, /caption and /schedule routes"
```

---

### Task 14: Frontend — `formValidation.js`

**Files:**
- Create: `frontend/formValidation.js`
- Test: `frontend/formValidation.test.js`
- Create: `frontend/package.json` (test tooling only, frontend itself ships with no build step)

**Interfaces:**
- Produces:
  ```js
  // validateScheduleForm(values) -> string[] (list of error messages, empty when valid)
  // values: { videoSelected: boolean, accountId: string, date: string, caption: string, password: string }
  export function validateScheduleForm(values) { ... }
  ```

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "insta-scheduler-frontend",
  "private": true,
  "version": "1.0.0",
  "type": "module",
  "scripts": {
    "test": "vitest run"
  },
  "devDependencies": {
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler/frontend
npm install
```

- [ ] **Step 3: Write the failing tests**

`frontend/formValidation.test.js`:
```js
import { describe, it, expect } from 'vitest';
import { validateScheduleForm } from './formValidation.js';

const validValues = {
  videoSelected: true,
  accountId: 'acc-1',
  date: '2099-01-01',
  caption: 'Hello world',
  password: 'secret',
};

describe('validateScheduleForm', () => {
  it('returns no errors for valid input', () => {
    expect(validateScheduleForm(validValues)).toEqual([]);
  });

  it('requires a video to be selected', () => {
    const errors = validateScheduleForm({ ...validValues, videoSelected: false });
    expect(errors).toContain('Selecione um vídeo.');
  });

  it('requires an account to be chosen', () => {
    const errors = validateScheduleForm({ ...validValues, accountId: '' });
    expect(errors).toContain('Escolha uma conta do Instagram.');
  });

  it('requires a date', () => {
    const errors = validateScheduleForm({ ...validValues, date: '' });
    expect(errors).toContain('Escolha uma data de publicação.');
  });

  it('rejects a date in the past', () => {
    const errors = validateScheduleForm({ ...validValues, date: '2020-01-01' });
    expect(errors).toContain('A data precisa ser hoje ou uma data futura.');
  });

  it('requires a non-empty caption', () => {
    const errors = validateScheduleForm({ ...validValues, caption: '   ' });
    expect(errors).toContain('A legenda não pode ficar vazia.');
  });

  it('requires the password field', () => {
    const errors = validateScheduleForm({ ...validValues, password: '' });
    expect(errors).toContain('Digite a senha.');
  });

  it('accumulates multiple errors at once', () => {
    const errors = validateScheduleForm({ videoSelected: false, accountId: '', date: '', caption: '', password: '' });
    expect(errors.length).toBe(5);
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm test` (from `frontend`)
Expected: FAIL — `Failed to resolve import "./formValidation.js"`

- [ ] **Step 5: Implement `frontend/formValidation.js`**

```js
export function validateScheduleForm(values) {
  const errors = [];
  const { videoSelected, accountId, date, caption, password } = values;

  if (!videoSelected) errors.push('Selecione um vídeo.');
  if (!accountId) errors.push('Escolha uma conta do Instagram.');

  if (!date) {
    errors.push('Escolha uma data de publicação.');
  } else {
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) errors.push('A data precisa ser hoje ou uma data futura.');
  }

  if (!caption || caption.trim().length === 0) errors.push('A legenda não pode ficar vazia.');
  if (!password) errors.push('Digite a senha.');

  return errors;
}
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test` (from `frontend`)
Expected: PASS

- [ ] **Step 7: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add frontend/package.json frontend/package-lock.json frontend/formValidation.js frontend/formValidation.test.js
git commit -m "feat(frontend): add schedule form validation"
```

---

### Task 15: Frontend — `index.html`, `style.css`, `app.js`

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/style.css`
- Create: `frontend/app.js`

**Interfaces:**
- Consumes: `validateScheduleForm` (Task 14), Worker routes `GET /accounts`, `POST /caption`, `POST /schedule` (Task 13).

- [ ] **Step 1: Create `frontend/index.html`**

```html
<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Insta Scheduler</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Agendar publicação no Instagram</h1>

    <form id="schedule-form">
      <label>
        Senha
        <input type="password" id="password" required />
      </label>

      <label>
        Vídeo
        <input type="file" id="video" accept="video/*" required />
      </label>

      <video id="preview" controls hidden></video>

      <label>
        Conta do Instagram
        <select id="account" required>
          <option value="">Carregando contas…</option>
        </select>
      </label>

      <label>
        Data de publicação
        <input type="date" id="date" required />
      </label>

      <label>
        Tema/contexto (opcional, ajuda a IA a escrever a legenda)
        <input type="text" id="hint" placeholder="ex: bike amarela, lançamento" />
      </label>

      <button type="button" id="generate-caption">Gerar legenda</button>

      <label>
        Legenda
        <textarea id="caption" rows="5"></textarea>
      </label>

      <p id="form-errors" role="alert"></p>
      <button type="submit">Agendar publicação</button>
      <p id="form-status"></p>
    </form>

    <section>
      <h2>Fila</h2>
      <ul id="queue-list"></ul>
    </section>
  </main>

  <script type="module" src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create `frontend/style.css`**

```css
:root {
  color-scheme: light dark;
  font-family: system-ui, sans-serif;
}

body {
  margin: 0;
  padding: 2rem;
  background: Canvas;
  color: CanvasText;
}

main {
  max-width: 40rem;
  margin: 0 auto;
}

form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

label {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-weight: 600;
}

input, select, textarea, button {
  font-size: 1rem;
  padding: 0.5rem;
}

video {
  max-width: 100%;
}

#form-errors {
  color: #c0392b;
  white-space: pre-line;
}

#queue-list {
  list-style: none;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

#queue-list li {
  border: 1px solid color-mix(in srgb, CanvasText 20%, transparent);
  border-radius: 0.5rem;
  padding: 0.75rem;
}
```

- [ ] **Step 3: Create `frontend/app.js`**

```js
import { validateScheduleForm } from './formValidation.js';

const WORKER_URL = 'https://insta-scheduler.YOUR_SUBDOMAIN.workers.dev';

const form = document.getElementById('schedule-form');
const passwordInput = document.getElementById('password');
const videoInput = document.getElementById('video');
const preview = document.getElementById('preview');
const accountSelect = document.getElementById('account');
const dateInput = document.getElementById('date');
const hintInput = document.getElementById('hint');
const captionField = document.getElementById('caption');
const generateCaptionButton = document.getElementById('generate-caption');
const formErrors = document.getElementById('form-errors');
const formStatus = document.getElementById('form-status');
const queueList = document.getElementById('queue-list');

async function loadAccounts() {
  const password = passwordInput.value;
  if (!password) return;

  const res = await fetch(`${WORKER_URL}/accounts`, {
    headers: { 'x-app-password': password },
  });
  if (!res.ok) {
    accountSelect.innerHTML = '<option value="">Falha ao carregar contas</option>';
    return;
  }
  const { accounts } = await res.json();
  accountSelect.innerHTML = accounts
    .map(account => `<option value="${account.id}">${account.username}</option>`)
    .join('');
}

passwordInput.addEventListener('change', loadAccounts);

videoInput.addEventListener('change', () => {
  if (videoInput.files[0]) {
    preview.src = URL.createObjectURL(videoInput.files[0]);
    preview.hidden = false;
  }
});

function captureFrameAsBase64() {
  return new Promise((resolve, reject) => {
    if (preview.readyState < 1) {
      reject(new Error('Aguarde o vídeo carregar antes de gerar a legenda.'));
      return;
    }
    const handleSeeked = () => {
      const canvas = document.createElement('canvas');
      canvas.width = preview.videoWidth;
      canvas.height = preview.videoHeight;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(preview, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
      preview.removeEventListener('seeked', handleSeeked);
      resolve(dataUrl.split(',')[1]);
    };
    preview.addEventListener('seeked', handleSeeked);
    preview.currentTime = Math.min(preview.duration * 0.4, preview.duration - 0.1);
  });
}

generateCaptionButton.addEventListener('click', async () => {
  formErrors.textContent = '';
  if (!videoInput.files[0]) {
    formErrors.textContent = 'Selecione um vídeo antes de gerar a legenda.';
    return;
  }
  if (!passwordInput.value) {
    formErrors.textContent = 'Digite a senha antes de gerar a legenda.';
    return;
  }

  generateCaptionButton.disabled = true;
  generateCaptionButton.textContent = 'Gerando…';
  try {
    const frameBase64 = await captureFrameAsBase64();
    const res = await fetch(`${WORKER_URL}/caption`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value, hint: hintInput.value, frame_base64: frameBase64 }),
    });
    if (!res.ok) throw new Error(`Falha ao gerar legenda (${res.status})`);
    const { caption } = await res.json();
    captionField.value = caption;
  } catch (err) {
    formErrors.textContent = err.message;
  } finally {
    generateCaptionButton.disabled = false;
    generateCaptionButton.textContent = 'Gerar legenda';
  }
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  formErrors.textContent = '';
  formStatus.textContent = '';

  const errors = validateScheduleForm({
    videoSelected: Boolean(videoInput.files[0]),
    accountId: accountSelect.value,
    date: dateInput.value,
    caption: captionField.value,
    password: passwordInput.value,
  });

  if (errors.length > 0) {
    formErrors.textContent = errors.join('\n');
    return;
  }

  const submitButton = form.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  formStatus.textContent = 'Enviando vídeo…';

  try {
    const body = new FormData();
    body.set('password', passwordInput.value);
    body.set('account_id', accountSelect.value);
    body.set('date', dateInput.value);
    body.set('caption', captionField.value);
    body.set('video', videoInput.files[0]);

    const res = await fetch(`${WORKER_URL}/schedule`, { method: 'POST', body });
    if (!res.ok) throw new Error(`Falha ao agendar (${res.status})`);

    formStatus.textContent = 'Publicação agendada com sucesso!';
    form.reset();
    preview.hidden = true;
    await loadQueue();
  } catch (err) {
    formErrors.textContent = err.message;
  } finally {
    submitButton.disabled = false;
  }
});

async function loadQueue() {
  try {
    const res = await fetch('../queue.json', { cache: 'no-store' });
    const queue = await res.json();
    queueList.innerHTML = queue
      .map(entry => `<li>${entry.date} — ${entry.status} — ${entry.caption.slice(0, 60)}</li>`)
      .join('') || '<li>Fila vazia.</li>';
  } catch {
    queueList.innerHTML = '<li>Não foi possível carregar a fila.</li>';
  }
}

loadQueue();
```

- [ ] **Step 4: Manual browser verification**

Serve the frontend locally and click through the flow:

```bash
cd /d/Users/Hans/Projetos/insta-scheduler/frontend
python -m http.server 8080
```

Open `http://localhost:8080` and confirm:
- Selecting a video shows the preview player.
- Submitting with empty fields shows the validation errors from Task 14 instead of calling the network.
- Console shows the expected fetch calls to `WORKER_URL` (they will fail with a network error until Task 18 deploys the Worker — that is expected at this point in the plan).

- [ ] **Step 5: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add frontend/index.html frontend/style.css frontend/app.js
git commit -m "feat(frontend): add scheduling form UI wired to the Worker API"
```

---

### Task 16: GitHub Pages deploy workflow

**Files:**
- Create: `.github/workflows/pages-deploy.yml`

- [ ] **Step 1: Create the workflow**

`.github/workflows/pages-deploy.yml`:
```yaml
name: Deploy Frontend to GitHub Pages

on:
  push:
    branches: [main]
    paths:
      - 'frontend/**'
      - '.github/workflows/pages-deploy.yml'
  workflow_dispatch: {}

permissions:
  contents: read
  pages: write
  id-token: write

concurrency:
  group: pages
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: frontend
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add .github/workflows/pages-deploy.yml
git commit -m "ci: deploy frontend to GitHub Pages on push"
```

---

### Task 17: README with full setup instructions

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Replace `README.md` with full setup instructions**

```markdown
# Insta Scheduler

Agenda publicações de vídeo no Instagram (via [Zernio](https://zernio.com)) a
partir de um formulário web: você escolhe o vídeo, a conta e a data; a IA
sugere uma legenda; no dia marcado, um workflow do GitHub Actions publica
sozinho.

## Arquitetura

Ver `docs/superpowers/specs/2026-09-06-insta-scheduler-design.md` para o
desenho completo. Resumo:

- `frontend/` — página estática (GitHub Pages).
- `worker/` — Cloudflare Worker (backend leve, guarda os segredos).
- `scripts/publish/` — script Node rodado diariamente pelo GitHub Actions.
- `queue.json` / `history.json` — fila de posts agendados / já publicados.

## Configuração

### 1. Criar o repositório no GitHub

```bash
gh repo create insta-scheduler --private --source=. --remote=origin
git push -u origin master
```

### 2. Gerar as chaves necessárias

| Segredo | Onde conseguir |
|---|---|
| `ZERNIO_API_KEY` | zernio.com → Settings → API Keys |
| `ANTHROPIC_API_KEY` | console.anthropic.com → API Keys |
| `GITHUB_TOKEN` (para o Worker) | github.com → Settings → Developer settings → Fine-grained tokens, escopo **Contents: Read and write** só neste repositório |
| `APP_PASSWORD` | uma senha à sua escolha, só você vai usar |

### 3. Configurar o secret do GitHub Actions

```bash
gh secret set ZERNIO_API_KEY --repo SEU_USUARIO/insta-scheduler
```

### 4. Publicar a Worker (Cloudflare)

```bash
cd worker
npx wrangler login
npx wrangler secret put APP_PASSWORD
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ZERNIO_API_KEY
```

Edite `worker/wrangler.toml` e troque `GITHUB_OWNER` pelo seu usuário do
GitHub. Depois:

```bash
npm run deploy
```

Anote a URL que a Cloudflare devolver (algo como
`https://insta-scheduler.SEU_SUBDOMINIO.workers.dev`).

### 5. Apontar o frontend para a Worker

Edite `frontend/app.js` e troque `WORKER_URL` pela URL do passo anterior.
Faça commit e push — o workflow `pages-deploy.yml` publica automaticamente.

### 6. Ativar o GitHub Pages

No repositório: Settings → Pages → Source → **GitHub Actions**.

### 7. Testar

1. Abra a URL do GitHub Pages, digite a senha, escolha um vídeo pequeno, uma
   conta e a data de hoje.
2. Confirme que `queue.json` recebeu a entrada (veja o repositório no
   GitHub).
3. Rode o workflow `Daily Instagram Publish` manualmente (aba Actions →
   Run workflow) e confirme que o post saiu e a entrada foi para
   `history.json`.

## Fila e histórico

- `queue.json`: posts agendados (`scheduled`) ou que falharam (`failed`,
  com o motivo em `error` — não são tentados de novo sozinhos).
- `history.json`: posts publicados com sucesso.
```

- [ ] **Step 2: Commit**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
git add README.md
git commit -m "docs: add full setup instructions"
```

---

### Task 18: Create the GitHub repository and do the first push

**Files:** none (operational task)

This task publishes the repository publicly/privately on GitHub. **Confirm the visibility (private vs. public) and the exact repo name with Hans before running this** — creating and pushing a new remote repository is a visible, semi-hard-to-reverse action.

- [ ] **Step 1: Create the repository**

```bash
cd /d/Users/Hans/Projetos/insta-scheduler
gh repo create insta-scheduler --private --source=. --remote=origin
```

- [ ] **Step 2: Push**

```bash
git branch -M main
git push -u origin main
```

- [ ] **Step 3: Set the Actions secret**

```bash
gh secret set ZERNIO_API_KEY --repo SEU_USUARIO/insta-scheduler
```
(Prompts for the value — paste the real Zernio API key when asked.)

- [ ] **Step 4: Enable GitHub Pages**

In the repo on github.com: Settings → Pages → Source → GitHub Actions.

- [ ] **Step 5: Deploy the Worker and update `WORKER_URL`**

Follow README.md steps 4–5 (Task 17), then commit and push the `frontend/app.js` change with the real Worker URL.

- [ ] **Step 6: End-to-end manual test**

Follow README.md step 7 (Task 17): schedule a real small video for today from the deployed frontend, then trigger `Daily Instagram Publish` via `workflow_dispatch` and confirm the post appears on Instagram and the entry moves to `history.json`.
