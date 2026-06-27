import { serve } from '@hono/node-server';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import board from './routes/board.js';
import ai from './routes/ai.js';

const app = new Hono();

app.use('*', cors({ origin: '*' }));

app.route('/api/board', board);
app.route('/api/ai', ai);

app.get('/health', (c) => c.json({ ok: true }));

const port = Number(process.env.PORT ?? 3001);
console.log(`Kanban API running on port ${port}`);

serve({ fetch: app.fetch, port });
