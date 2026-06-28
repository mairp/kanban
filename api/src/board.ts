import { getDb } from './db.js';

export interface Card {
  id: string;
  title: string;
  details: string;
  position: number;
}

export interface Column {
  id: string;
  title: string;
  color: string;
  position: number;
  cards: Card[];
}

export function getBoard(): Column[] {
  const db = getDb();
  const cols = db.prepare('SELECT * FROM columns ORDER BY position').all() as Column[];
  const getCards = db.prepare('SELECT * FROM cards WHERE column_id = ? ORDER BY position');
  return cols.map((col) => ({
    ...col,
    cards: getCards.all(col.id) as Card[],
  }));
}

export function addCard(columnId: string, title: string, details: string): Card {
  const db = getDb();
  const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as m FROM cards WHERE column_id = ?').get(columnId) as { m: number };
  const id = crypto.randomUUID();
  const position = maxPos.m + 1;
  db.prepare('INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)').run(id, columnId, title, details, position);
  return { id, title, details, position };
}

export function deleteCard(cardId: string): boolean {
  const db = getDb();
  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as (Card & { column_id: string }) | undefined;
  if (!card) return false;

  db.transaction(() => {
    db.prepare(
      `INSERT INTO card_archive (id, column_id, title, details, archived_at, reason)
       VALUES (?, ?, ?, ?, datetime('now'), 'deleted')`
    ).run(card.id, card.column_id, card.title, card.details);
    db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
  })();
  return true;
}

export function moveCard(cardId: string, toColumnId: string, toPosition: number): boolean {
  const db = getDb();

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as Card & { column_id: string } | undefined;
  if (!card) return false;

  const fromColumnId = card.column_id;

  const move = db.transaction(() => {
    const update = db.prepare('UPDATE cards SET position = ? WHERE id = ?');

    // Move the card into the target column (UPDATE in place — never DELETE,
    // or the row is gone). Park it at a sentinel position first so the reorder
    // below can place it precisely.
    db.prepare('UPDATE cards SET column_id = ?, position = ? WHERE id = ?').run(toColumnId, 1_000_000, cardId);

    // Rebuild the target column's order with the card inserted at toPosition.
    const target = db.prepare('SELECT id FROM cards WHERE column_id = ? AND id != ? ORDER BY position').all(toColumnId, cardId) as { id: string }[];
    target.splice(toPosition, 0, { id: cardId });
    target.forEach((s, i) => update.run(i, s.id));

    // Compact the source column so positions stay contiguous (skip if same column).
    if (fromColumnId !== toColumnId) {
      const src = db.prepare('SELECT id FROM cards WHERE column_id = ? ORDER BY position').all(fromColumnId) as { id: string }[];
      src.forEach((s, i) => update.run(i, s.id));
    }
  });

  move();

  if (toColumnId === 'done') {
    db.prepare(
      `INSERT INTO card_archive (id, column_id, title, details, archived_at, reason)
       VALUES (?, 'done', ?, ?, datetime('now'), 'completed')`
    ).run(card.id, card.title, card.details);
  }

  return true;
}

export function getArchive(): (Card & { column_id: string; archived_at: string; reason: string })[] {
  const db = getDb();
  return db.prepare('SELECT * FROM card_archive ORDER BY archived_at DESC').all() as (Card & { column_id: string; archived_at: string; reason: string })[];
}

export function renameColumn(columnId: string, title: string): boolean {
  const db = getDb();
  const result = db.prepare('UPDATE columns SET title = ? WHERE id = ?').run(title, columnId);
  return result.changes > 0;
}

export function findCards(query: string): (Card & { column_id: string; column_title: string })[] {
  const db = getDb();
  return db.prepare(`
    SELECT c.*, col.title as column_title
    FROM cards c
    JOIN columns col ON col.id = c.column_id
    WHERE c.title LIKE ? OR c.details LIKE ?
    ORDER BY col.position, c.position
  `).all(`%${query}%`, `%${query}%`) as (Card & { column_id: string; column_title: string })[];
}
