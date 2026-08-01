import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('❌ DATABASE_URL غير محدد في متغيرات البيئة.');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function initDatabase(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id           SERIAL PRIMARY KEY,
      telegram_id  BIGINT UNIQUE NOT NULL,
      username     TEXT,
      first_name   TEXT NOT NULL,
      last_name    TEXT,
      points       INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS channels (
      id                SERIAL PRIMARY KEY,
      channel_username  TEXT NOT NULL,
      channel_name      TEXT NOT NULL,
      points_reward     INTEGER NOT NULL DEFAULT 10,
      is_active         SMALLINT NOT NULL DEFAULT 1,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS completed_tasks (
      id           SERIAL PRIMARY KEY,
      user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_id   INTEGER NOT NULL REFERENCES channels(id) ON DELETE CASCADE,
      completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, channel_id)
    );

    CREATE TABLE IF NOT EXISTS campaigns (
      id                    SERIAL PRIMARY KEY,
      user_id               INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      channel_username      TEXT NOT NULL,
      channel_name          TEXT NOT NULL,
      target_subscribers    INTEGER NOT NULL,
      completed_subscribers INTEGER NOT NULL DEFAULT 0,
      points_paid           INTEGER NOT NULL,
      status                TEXT NOT NULL DEFAULT 'active',
      created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS campaign_subscriptions (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      campaign_id   INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
      subscribed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, campaign_id)
    );

    CREATE TABLE IF NOT EXISTS daily_claims (
      id            SERIAL PRIMARY KEY,
      user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claimed_date  DATE NOT NULL,
      points_earned INTEGER NOT NULL DEFAULT 5,
      claimed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, claimed_date)
    );

    CREATE TABLE IF NOT EXISTS settings (
      key        TEXT PRIMARY KEY,
      value      TEXT NOT NULL,
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // تهيئة القيم الافتراضية للإعدادات إن لم تكن موجودة
  await pool.query(`
    INSERT INTO settings (key, value) VALUES
      ('campaign_points', '1'),
      ('pricing_tiers', '[{"subscribers":5,"points":10,"label":"5 مشتركين  — 10 نقاط"},{"subscribers":10,"points":20,"label":"10 مشتركين — 20 نقطة"},{"subscribers":20,"points":40,"label":"20 مشتركاً — 40 نقطة"},{"subscribers":50,"points":100,"label":"50 مشتركاً — 100 نقطة"}]')
    ON CONFLICT (key) DO NOTHING;
  `);

  console.log('✅ قاعدة البيانات (Supabase) جاهزة.');
}
