import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_DIR = process.env.DATA_DIR ?? path.join(__dirname, '../../../data');
const DB_PATH = path.join(DB_DIR, 'bot.db');

fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);

export function initDatabase(): void {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('PRAGMA foreign_keys = ON');

  db.exec(`
    -- المستخدمون
    CREATE TABLE IF NOT EXISTS users (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      telegram_id  INTEGER UNIQUE NOT NULL,
      username     TEXT,
      first_name   TEXT NOT NULL,
      last_name    TEXT,
      points       INTEGER NOT NULL DEFAULT 0,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- قنوات الأدمن (مهام ثابتة يضيفها الأدمن)
    CREATE TABLE IF NOT EXISTS channels (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      channel_username  TEXT NOT NULL,
      channel_name      TEXT NOT NULL,
      points_reward     INTEGER NOT NULL DEFAULT 10,
      is_active         INTEGER NOT NULL DEFAULT 1,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    -- سجل إتمام مهام قنوات الأدمن
    CREATE TABLE IF NOT EXISTS completed_tasks (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      channel_id   INTEGER NOT NULL,
      completed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)    REFERENCES users(id),
      FOREIGN KEY (channel_id) REFERENCES channels(id),
      UNIQUE(user_id, channel_id)
    );

    -- حملات الترويج التي ينشئها المستخدمون
    CREATE TABLE IF NOT EXISTS campaigns (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id               INTEGER NOT NULL,
      channel_username      TEXT NOT NULL,
      channel_name          TEXT NOT NULL,
      target_subscribers    INTEGER NOT NULL,
      completed_subscribers INTEGER NOT NULL DEFAULT 0,
      points_paid           INTEGER NOT NULL,
      status                TEXT NOT NULL DEFAULT 'active',
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    -- سجل اشتراكات الحملات (يمنع التكرار)
    CREATE TABLE IF NOT EXISTS campaign_subscriptions (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER NOT NULL,
      campaign_id INTEGER NOT NULL,
      subscribed_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id)     REFERENCES users(id),
      FOREIGN KEY (campaign_id) REFERENCES campaigns(id),
      UNIQUE(user_id, campaign_id)
    );

    -- المكافآت اليومية
    CREATE TABLE IF NOT EXISTS daily_claims (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id      INTEGER NOT NULL,
      claimed_date TEXT NOT NULL,
      points_earned INTEGER NOT NULL DEFAULT 5,
      claimed_at   TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id),
      UNIQUE(user_id, claimed_date)
    );
  `);
}
