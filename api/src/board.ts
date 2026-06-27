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
  const result = db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);
  return result.changes > 0;
}

export function moveCard(cardId: string, toColumnId: string, toPosition: number): boolean {
  const db = getDb();

  const card = db.prepare('SELECT * FROM cards WHERE id = ?').get(cardId) as Card & { column_id: string } | undefined;
  if (!card) return false;

  const move = db.transaction(() => {
    db.prepare('DELETE FROM cards WHERE id = ?').run(cardId);

    const siblings = db.prepare('SELECT id FROM cards WHERE column_id = ? ORDER BY position').all(toColumnId) as { id: string }[];

    siblings.splice(toPosition, 0, { id: cardId });

    const update = db.prepare('UPDATE cards SET position = ? WHERE id = ?');
    siblings.forEach((s, i) => update.run(i, s.id));

    db.prepare('UPDATE cards SET column_id = ?, position = ?, title = ?, details = ? WHERE id = ?').run(
      toColumnId, toPosition, card.title, card.details, cardId
    );

    const rerank = db.prepare('SELECT id FROM cards WHERE column_id = ? ORDER BY position').all(toColumnId) as { id: string }[];
    rerank.forEach((s, i) => update.run(i, s.id));
  });

  move();
  return true;
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
