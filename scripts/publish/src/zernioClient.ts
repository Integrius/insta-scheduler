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
