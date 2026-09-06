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
