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
