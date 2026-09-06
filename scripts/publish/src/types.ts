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
