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
