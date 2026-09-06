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
