import { Hono } from 'hono';
import { getBoard } from '../board.js';

const ai = new Hono();

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://host.docker.internal:4000';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? '';
// Primary model + comma-separated fallbacks. LiteLLM tries each in order if one
// upstream (core42/Google/Compass) flaps, so the panel degrades gracefully.
const MODEL = process.env.AI_MODEL ?? 'gpt-5';
const FALLBACKS = (process.env.AI_FALLBACKS ?? 'gemini-2.5-flash,gpt-5.5')
  .split(',')
  .map((m) => m.trim())
  .filter(Boolean);
// Fail fast instead of hanging the browser when an upstream stalls.
const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS ?? 30000);

ai.post('/suggest', async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt?.trim()) return c.json({ error: 'prompt required' }, 400);

  const board = getBoard();
  const boardSummary = board
    .map((col) => `${col.title} (${col.cards.length} cards): ${col.cards.map((card) => card.title).join(', ') || 'empty'}`)
    .join('\n');

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), AI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
      method: 'POST',
      signal: ac.signal,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${LITELLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: MODEL,
        fallbacks: FALLBACKS,
        stream: true,
        messages: [
          {
            role: 'system',
            content: `You are an AI assistant integrated into a kanban board. Help the user manage and organize their tasks.
Current board state:
${boardSummary}

Be concise and practical. When suggesting tasks, format them clearly. You can suggest moving cards, adding new ones, or reorganizing the board.`,
          },
          { role: 'user', content: prompt.trim() },
        ],
      }),
    });
  } catch (err) {
    clearTimeout(timer);
    const reason = err instanceof Error && err.name === 'AbortError'
      ? `AI request timed out after ${AI_TIMEOUT_MS / 1000}s`
      : `AI request failed: ${err instanceof Error ? err.message : String(err)}`;
    return c.json({ error: reason }, 504);
  }

  if (!res.ok || !res.body) {
    clearTimeout(timer);
    const err = await res.text();
    return c.json({ error: `LLM error: ${err}` }, 502);
  }

  const readable = new ReadableStream({
    async start(ctrl) {
      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      const encoder = new TextEncoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const json = JSON.parse(data);
            const text = json.choices?.[0]?.delta?.content;
            if (text) ctrl.enqueue(encoder.encode(text));
          } catch {}
        }
      }
      clearTimeout(timer);
      ctrl.close();
    },
    cancel() {
      clearTimeout(timer);
      ac.abort();
    },
  });

  return new Response(readable, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

export default ai;
