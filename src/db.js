const path = require('path');
const { DatabaseSync } = require('node:sqlite');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data.sqlite');
const db = new DatabaseSync(dbPath);

db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA busy_timeout = 5000');

db.exec(`
CREATE TABLE IF NOT EXISTS topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  mendeley_folder_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  issn TEXT,
  mendeley_folder_id TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  topic_id INTEGER,
  journal_id INTEGER,
  title TEXT NOT NULL,
  authors TEXT,
  abstract TEXT,
  url TEXT,
  doi TEXT,
  source TEXT,
  published_date TEXT,
  found_at TEXT DEFAULT (datetime('now')),
  mendeley_document_id TEXT,
  read_at TEXT,
  UNIQUE(url),
  FOREIGN KEY(topic_id) REFERENCES topics(id),
  FOREIGN KEY(journal_id) REFERENCES journals(id),
  CHECK ((topic_id IS NOT NULL) OR (journal_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS newsletters (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL UNIQUE,
  html TEXT NOT NULL,
  article_count INTEGER DEFAULT 0,
  sent INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS reading_log (
  date TEXT PRIMARY KEY,
  count INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
`);

for (const [table, columns] of Object.entries({
  articles: { relevance_status: "TEXT DEFAULT 'pending'", relevance_json:'TEXT', keywords_json:"TEXT DEFAULT '[]'", zotero_synced: 'INTEGER DEFAULT 0', pmid: 'TEXT', zotero_item_key: 'TEXT', sent_at: 'TEXT', selected_date: 'TEXT' },
  newsletters: { publication_date: 'TEXT', status: "TEXT DEFAULT 'pending'", last_error: 'TEXT', message_id: 'TEXT', attempts: 'INTEGER DEFAULT 0' }
})) {
  const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name));
  for (const [column, type] of Object.entries(columns)) if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
}
db.exec(`CREATE TABLE IF NOT EXISTS runs (id INTEGER PRIMARY KEY, date TEXT, started_at TEXT DEFAULT (datetime('now')), finished_at TEXT, status TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS identities (identity TEXT PRIMARY KEY, article_id INTEGER NOT NULL);
CREATE INDEX IF NOT EXISTS articles_doi ON articles(doi);
CREATE INDEX IF NOT EXISTS articles_pmid ON articles(pmid);`);
db.exec(`CREATE TABLE IF NOT EXISTS literature_reviews (
 id INTEGER PRIMARY KEY, topic TEXT NOT NULL, start_year INTEGER NOT NULL, end_year INTEGER NOT NULL,
 result_limit INTEGER NOT NULL, status TEXT NOT NULL DEFAULT 'running', progress TEXT,
 result_json TEXT, error TEXT, owner_pid INTEGER, created_at TEXT DEFAULT (datetime('now')), finished_at TEXT
);`);
const { doi } = require('./core');
for (const a of db.prepare('SELECT id, doi, pmid, url FROM articles').all()) {
  if (!a.pmid) a.pmid = /pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)/.exec(a.url || '')?.[1] || null;
  for (const key of [doi(a.doi) && `doi:${doi(a.doi)}`, a.pmid && `pmid:${a.pmid}`, a.url && `url:${a.url}`].filter(Boolean))
    db.prepare('INSERT OR IGNORE INTO identities VALUES (?,?)').run(key,a.id);
}
require('./daily-relevance').refreshHistory(db);
module.exports = db;
