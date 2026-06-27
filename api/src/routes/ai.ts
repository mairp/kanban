import { Hono } from 'hono';
import { getBoard } from '../board.js';

const ai = new Hono();

const LITELLM_URL = process.env.LITELLM_URL ?? 'http://host.docker.internal:4000';
const LITELLM_API_KEY = process.env.LITELLM_API_KEY ?? '';
const MODEL = process.env.AI_MODEL ?? 'gpt-5';

ai.post('/suggest', async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt?.trim()) return c.json({ error: 'prompt required' }, 400);

  const board = getBoard();
  const boardSummary = board
    .map((col) => `${col.title} (${col.cards.length} cards): ${col.cards.map((card) => card.title).join(', ') || 'empty'}`)
    .join('\n');

  const res = await fetch(`${LITELLM_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${LITELLM_API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
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

  if (!res.ok || !res.body) {
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
      ctrl.close();
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
