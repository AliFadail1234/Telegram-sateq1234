import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('❌ DATABASE_URL غير محدد في متغيرات البيئة.');
}

const useSsl = process.env.DB_SSL !== 'false' && (process.env.DATABASE_URL?.includes('supabase') || process.env.NODE_ENV === 'production');
export const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : undefined,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

export async function initDatabase(): Promise<void> {
  // ===== الجداول الأساسية =====
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

  // ===== جدول القنوات الإجبارية =====
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mandatory_channels (
      id               SERIAL PRIMARY KEY,
      channel_username TEXT NOT NULL,
      channel_name     TEXT NOT NULL DEFAULT '',
      max_joins        INTEGER,
      current_joins    INTEGER NOT NULL DEFAULT 0,
      is_active        SMALLINT NOT NULL DEFAULT 1,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ===== جداول الهدايا والدعوات المعلقة =====
  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_gifts (
      id             SERIAL PRIMARY KEY,
      points         INTEGER NOT NULL,
      max_claims     INTEGER NOT NULL,
      current_claims INTEGER NOT NULL DEFAULT 0,
      description    TEXT,
      is_active      SMALLINT NOT NULL DEFAULT 1,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS gift_claims (
      id         SERIAL PRIMARY KEY,
      gift_id    INTEGER NOT NULL REFERENCES point_gifts(id) ON DELETE CASCADE,
      user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(gift_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS pending_referrals (
      id                SERIAL PRIMARY KEY,
      referrer_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      reward_points     INTEGER NOT NULL,
      tasks_completed   INTEGER NOT NULL DEFAULT 0,
      required_tasks    INTEGER NOT NULL DEFAULT 3,
      is_rewarded       SMALLINT NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(referred_id)
    );
  `);

  // ===== الجداول الجديدة =====
  await pool.query(`
    CREATE TABLE IF NOT EXISTS point_transactions (
      id          SERIAL PRIMARY KEY,
      user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type        TEXT NOT NULL,
      amount      INTEGER NOT NULL,
      description TEXT,
      related_id  INTEGER,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS admins (
      id          SERIAL PRIMARY KEY,
      telegram_id BIGINT UNIQUE NOT NULL,
      username    TEXT,
      permissions TEXT NOT NULL DEFAULT 'all',
      added_by    BIGINT,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS broadcasts (
      id           SERIAL PRIMARY KEY,
      message      TEXT NOT NULL,
      status       TEXT NOT NULL DEFAULT 'sent',
      total_sent   INTEGER NOT NULL DEFAULT 0,
      total_failed INTEGER NOT NULL DEFAULT 0,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  // ===== أعمدة جديدة على جدول المستخدمين =====
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned SMALLINT NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_count INTEGER NOT NULL DEFAULT 0;
    ALTER TABLE users ADD COLUMN IF NOT EXISTS referrer_id INTEGER;
  `);

  // ===== الفهارس =====
  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_users_telegram_id ON users(telegram_id);
    CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
    CREATE INDEX IF NOT EXISTS idx_users_points ON users(points DESC);
    CREATE INDEX IF NOT EXISTS idx_completed_tasks_user_id ON completed_tasks(user_id);
    CREATE INDEX IF NOT EXISTS idx_completed_tasks_channel_id ON completed_tasks(channel_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_subscriptions_user_id ON campaign_subscriptions(user_id);
    CREATE INDEX IF NOT EXISTS idx_campaign_subscriptions_campaign_id ON campaign_subscriptions(campaign_id);
    CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
    CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns(user_id);
    CREATE INDEX IF NOT EXISTS idx_daily_claims_user_id ON daily_claims(user_id);
    CREATE INDEX IF NOT EXISTS idx_point_transactions_user_id ON point_transactions(user_id);
    CREATE INDEX IF NOT EXISTS idx_point_transactions_created_at ON point_transactions(created_at DESC);
  `);

  // ===== القيم الافتراضية للإعدادات =====
  await pool.query(`
    INSERT INTO settings (key, value) VALUES
      ('campaign_points', '1'),
      ('daily_bonus_points', '5'),
      ('referral_reward', '10'),
      ('min_withdraw', '50'),
      ('bot_name', 'بوت النقاط'),
      ('welcome_message', 'مرحباً {name}! 👋\nأهلاً بك في بوت النقاط.\nاشترك في القنوات واكسب نقاطاً لترويج قناتك!'),
      ('pricing_tiers', '[{"subscribers":5,"points":10,"label":"5 مشتركين — 10 نقاط"},{"subscribers":10,"points":20,"label":"10 مشتركين — 20 نقطة"},{"subscribers":20,"points":40,"label":"20 مشتركاً — 40 نقطة"},{"subscribers":50,"points":100,"label":"50 مشتركاً — 100 نقطة"}]'),
      ('referral_task_threshold', '3')
    ON CONFLICT (key) DO NOTHING;
  `);

  console.log('✅ قاعدة البيانات (Supabase) جاهزة.');
}
