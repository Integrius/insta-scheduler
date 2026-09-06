export interface GitHubConfig {
  token: string;
  owner: string;
  repo: string;
  fetchImpl?: typeof fetch;
}

const GITHUB_API = 'https://api.github.com';
const MEDIA_RELEASE_TAG = 'media';

function base64EncodeUtf8(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64DecodeUtf8(base64: string): string {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

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
  const decoded = base64DecodeUtf8(data.content.replace(/\n/g, ''));
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
  const encoded = base64EncodeUtf8(JSON.stringify(content, null, 2) + '\n');

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
