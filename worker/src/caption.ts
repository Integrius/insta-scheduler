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
