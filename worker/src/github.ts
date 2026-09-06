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
