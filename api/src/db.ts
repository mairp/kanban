import Database from 'better-sqlite3';

const DB_PATH = process.env.DB_PATH ?? '/data/kanban.db';

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');
  initSchema(_db);
  return _db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_version (version INTEGER NOT NULL);

    CREATE TABLE IF NOT EXISTS columns (
      id       TEXT PRIMARY KEY,
      title    TEXT NOT NULL,
      color    TEXT NOT NULL,
      position INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS cards (
      id        TEXT PRIMARY KEY,
      column_id TEXT NOT NULL REFERENCES columns(id) ON DELETE CASCADE,
      title     TEXT NOT NULL,
      details   TEXT NOT NULL DEFAULT '',
      position  INTEGER NOT NULL
    );
  `);

  const versionRow = db.prepare('SELECT version FROM schema_version').get() as { version: number } | undefined;
  if (!versionRow) {
    db.prepare('INSERT INTO schema_version VALUES (1)').run();
    seedData(db);
  }
}

function seedData(db: Database.Database) {
  const insertCol = db.prepare(
    'INSERT INTO columns (id, title, color, position) VALUES (?, ?, ?, ?)'
  );
  const insertCard = db.prepare(
    'INSERT INTO cards (id, column_id, title, details, position) VALUES (?, ?, ?, ?, ?)'
  );

  const columns = [
    { id: 'backlog', title: 'Backlog', color: '#888888', cards: [
      { id: 'c1', title: 'User authentication flow', details: 'Design and implement OAuth2 login with Google and GitHub providers.' },
      { id: 'c2', title: 'Dashboard analytics', details: 'Build charts for weekly active users and revenue metrics.' },
      { id: 'c3', title: 'Email notification system', details: 'Transactional emails for signup, password reset, and order confirmation.' },
    ]},
    { id: 'in-progress', title: 'In Progress', color: '#209dd7', cards: [
      { id: 'c4', title: 'API rate limiting', details: 'Implement per-user rate limits to prevent abuse and ensure fair usage.' },
      { id: 'c5', title: 'Search indexing', details: 'Integrate Elasticsearch for full-text search across products and docs.' },
    ]},
    { id: 'review', title: 'Review', color: '#ecad0a', cards: [
      { id: 'c6', title: 'Payment gateway integration', details: 'Stripe checkout flow for subscriptions and one-time purchases.' },
      { id: 'c7', title: 'Mobile responsive layout', details: 'Ensure all pages render correctly on tablets and phones.' },
    ]},
    { id: 'done', title: 'Done', color: '#22c55e', cards: [
      { id: 'c8', title: 'Project scaffolding', details: 'Next.js setup with TypeScript, ESLint, Tailwind and CI pipeline.' },
      { id: 'c9', title: 'Database schema', details: 'PostgreSQL schema with migrations for users, products, and orders.' },
    ]},
    { id: 'blocked', title: 'Blocked', color: '#ef4444', cards: [
      { id: 'c10', title: 'Third-party API contract', details: 'Waiting on legal approval for the vendor data-sharing agreement.' },
    ]},
  ];

  const seed = db.transaction(() => {
    columns.forEach((col, ci) => {
      insertCol.run(col.id, col.title, col.color, ci);
      col.cards.forEach((card, ki) => {
        insertCard.run(card.id, col.id, card.title, card.details, ki);
      });
    });
  });
  seed();
}
