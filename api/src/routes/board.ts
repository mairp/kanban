import { Hono } from 'hono';
import { addClient, broadcast, removeClient } from '../events.js';
import { addCard, deleteCard, findCards, getArchive, getBoard, moveCard, renameColumn } from '../board.js';

const board = new Hono();

board.get('/', (c) => {
  return c.json({ columns: getBoard() });
});

board.get('/archive', (c) => {
  return c.json({ cards: getArchive() });
});

board.get('/events', (c) => {
  const stream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      addClient(ctrl);
      ctrl.enqueue(new TextEncoder().encode('data: connected\n\n'));
    },
    cancel(ctrl) {
      removeClient(ctrl);
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*',
    },
  });
});

board.put('/columns/:id', async (c) => {
  const id = c.req.param('id');
  const { title } = await c.req.json<{ title: string }>();
  if (!title?.trim()) return c.json({ error: 'title required' }, 400);
  const ok = renameColumn(id, title.trim());
  if (!ok) return c.json({ error: 'column not found' }, 404);
  broadcast();
  return c.json({ ok: true });
});

board.post('/columns/:id/cards', async (c) => {
  const columnId = c.req.param('id');
  const { title, details = '' } = await c.req.json<{ title: string; details?: string }>();
  if (!title?.trim()) return c.json({ error: 'title required' }, 400);
  const card = addCard(columnId, title.trim(), details.trim());
  broadcast();
  return c.json(card, 201);
});

board.delete('/columns/:columnId/cards/:cardId', (c) => {
  const cardId = c.req.param('cardId');
  const ok = deleteCard(cardId);
  if (!ok) return c.json({ error: 'card not found' }, 404);
  broadcast();
  return c.json({ ok: true });
});

board.post('/move', async (c) => {
  const { cardId, toColumnId, toPosition } = await c.req.json<{
    cardId: string;
    toColumnId: string;
    toPosition: number;
  }>();
  if (!cardId || !toColumnId || toPosition === undefined) {
    return c.json({ error: 'cardId, toColumnId, toPosition required' }, 400);
  }
  const ok = moveCard(cardId, toColumnId, toPosition);
  if (!ok) return c.json({ error: 'card not found' }, 404);
  broadcast();
  return c.json({ ok: true });
});

board.get('/search', (c) => {
  const q = c.req.query('q') ?? '';
  return c.json({ cards: findCards(q) });
});

export default board;
