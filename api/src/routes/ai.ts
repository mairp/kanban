import { Hono } from 'hono';
import Anthropic from '@anthropic-ai/sdk';
import { getBoard } from '../board.js';

const ai = new Hono();
const client = new Anthropic();

ai.post('/suggest', async (c) => {
  const { prompt } = await c.req.json<{ prompt: string }>();
  if (!prompt?.trim()) return c.json({ error: 'prompt required' }, 400);

  const board = getBoard();
  const boardSummary = board
    .map((col) => `${col.title} (${col.cards.length} cards): ${col.cards.map((card) => card.title).join(', ') || 'empty'}`)
    .join('\n');

  const stream = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 1024,
    stream: true,
    system: `You are an AI assistant integrated into a kanban board. Help the user manage and organize their tasks.
Current board state:
${boardSummary}

Be concise and practical. When suggesting tasks, format them clearly. You can suggest moving cards, adding new ones, or reorganizing the board.`,
    messages: [{ role: 'user', content: prompt.trim() }],
  });

  const readable = new ReadableStream({
    async start(ctrl) {
      const encoder = new TextEncoder();
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          ctrl.enqueue(encoder.encode(event.delta.text));
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
