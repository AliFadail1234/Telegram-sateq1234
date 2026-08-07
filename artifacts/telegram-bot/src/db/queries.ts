import { pool } from './database.js';

// ========== ط£ظ†ظˆط§ط¹ ط§ظ„ط¨ظٹط§ظ†ط§طھ ==========

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  points: number;
  created_at: string;
}

export interface Channel {
  id: number;
  channel_username: string;
  channel_name: string;
  points_reward: number;
  is_active: number;
  created_at: string;
}

export interface Campaign {
  id: number;
  user_id: number;
  channel_username: string;
  channel_name: string;
  target_subscribers: number;
  completed_subscribers: number;
  points_paid: number;
  status: 'active' | 'completed' | 'stopped';
  created_at: string;
}

export interface DailyClaimStatus {
  canClaim: boolean;
  lastClaimDate: string | null;
}

// ========== ظ…ط³ط§ط¹ط¯ظˆ طھط­ظˆظٹظ„ ط§ظ„ط£ظ†ظˆط§ط¹ ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toUser(r: any): User {
  return {
    id: Number(r.id),
    telegram_id: Number(r.telegram_id),
    username: r.username ?? null,
    first_name: r.first_name,
    last_name: r.last_name ?? null,
    points: Number(r.points),
    created_at: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toChannel(r: any): Channel {
  return {
    id: Number(r.id),
    channel_username: r.channel_username,
    channel_name: r.channel_name,
    points_reward: Number(r.points_reward),
    is_active: Number(r.is_active),
    created_at: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toCampaign(r: any): Campaign {
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    channel_username: r.channel_username,
    channel_name: r.channel_name,
    target_subscribers: Number(r.target_subscribers),
    completed_subscribers: Number(r.completed_subscribers),
    points_paid: Number(r.points_paid),
    status: r.status as Campaign['status'],
    created_at: r.created_at,
  };
}

// ========== ط§ظ„ظ…ط³طھط®ط¯ظ…ظˆظ† ==========

export async function getUserByTelegramId(telegramId: number): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE telegram_id = $1', [telegramId]);
  return rows[0] ? toUser(rows[0]) : undefined;
}

export async function getUserById(id: number): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE id = $1', [id]);
  return rows[0] ? toUser(rows[0]) : undefined;
}

export async function createUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): Promise<User> {
  const { rows } = await pool.query(
    'INSERT INTO users (telegram_id, first_name, last_name, username) VALUES ($1, $2, $3, $4) RETURNING *',
    [telegramId, firstName, lastName, username],
  );
  return toUser(rows[0]);
}

export async function getOrCreateUser(
  telegramId: number,
  firstName: string,
  lastName: string | null,
  username: string | null,
): Promise<{ user: User; isNew: boolean }> {
  const { rows } = await pool.query(
    `INSERT INTO users (telegram_id, first_name, last_name, username)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (telegram_id) DO NOTHING
     RETURNING *`,
    [telegramId, firstName, lastName, username],
  );

  if (rows[0]) {
    return { user: toUser(rows[0]), isNew: true };
  }

  const existing = await getUserByTelegramId(telegramId);
  if (!existing) {
    throw new Error('Failed to retrieve or create user');
  }

  return { user: existing, isNew: false };
}

export async function addPoints(userId: number, points: number): Promise<void> {
  await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [points, userId]);
}

export async function deductPoints(userId: number, points: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1',
    [points, userId],
  );
  return rowCount > 0;
}

export async function getUsersCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM users');
  return Number(rows[0].c);
}

export async function searchUserByUsername(username: string): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE username ILIKE $1', [`%${username}%`]);
  return rows[0] ? toUser(rows[0]) : undefined;
}

export async function searchUserByTelegramId(telegramId: number): Promise<User | undefined> {
  return getUserByTelegramId(telegramId);
}

export async function getAllUsers(limit = 100, offset = 0): Promise<User[]> {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY points DESC LIMIT $1 OFFSET $2', [limit, offset]);
  return rows.map(toUser);
}

export async function setUserPoints(userId: number, points: number): Promise<void> {
  await pool.query('UPDATE users SET points = $1 WHERE id = $2', [points, userId]);
}

// ========== ظ‚ظ†ظˆط§طھ ط§ظ„ط£ط¯ظ…ظ† ==========

export async function getActiveChannels(): Promise<Channel[]> {
  const { rows } = await pool.query('SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at DESC');
  return rows.map(toChannel);
}

export async function getChannelById(id: number): Promise<Channel | undefined> {
  const { rows } = await pool.query('SELECT * FROM channels WHERE id = $1', [id]);
  return rows[0] ? toChannel(rows[0]) : undefined;
}

export async function createChannel(username: string, name: string, pointsReward: number): Promise<Channel> {
  const { rows } = await pool.query(
    'INSERT INTO channels (channel_username, channel_name, points_reward) VALUES ($1, $2, $3) RETURNING *',
    [username, name, pointsReward],
  );
  return toChannel(rows[0]);
}

export async function deleteChannel(id: number): Promise<void> {
  await pool.query('DELETE FROM channels WHERE id = $1', [id]);
}

export async function updateChannelPoints(id: number, points: number): Promise<void> {
  await pool.query('UPDATE channels SET points_reward = $1 WHERE id = $2', [points, id]);
}

export async function getChannelsCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM channels WHERE is_active = 1');
  return Number(rows[0].c);
}

// ========== ظ…ظ‡ط§ظ… ظ‚ظ†ظˆط§طھ ط§ظ„ط£ط¯ظ…ظ† ==========

export async function hasCompletedTask(userId: number, channelId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM completed_tasks WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId],
  );
  return rows.length > 0;
}

export async function completeTask(userId: number, channelId: number): Promise<boolean> {
  try {
    await pool.query(
      'INSERT INTO completed_tasks (user_id, channel_id) VALUES ($1, $2)',
      [userId, channelId],
    );
    return true;
  } catch { return false; }
}

export async function getUserCompletedTasksCount(userId: number): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM completed_tasks WHERE user_id = $1', [userId]);
  return Number(rows[0].c);
}

export async function getNextPendingChannel(userId: number, excludeIds: number[] = []): Promise<Channel | undefined> {
  const excluded = [
    ...excludeIds,
  ];
  const placeholders = excluded.length
    ? `AND c.id NOT IN (${excluded.map((_, i) => `$${i + 2}`).join(', ')})`
    : '';
  const { rows } = await pool.query(`
    SELECT c.* FROM channels c
    WHERE c.is_active = 1
      AND c.id NOT IN (SELECT channel_id FROM completed_tasks WHERE user_id = $1)
      ${placeholders}
    ORDER BY c.created_at ASC LIMIT 1
  `, [userId, ...excluded]);
  return rows[0] ? toChannel(rows[0]) : undefined;
}

// ========== ط§ظ„ط­ظ…ظ„ط§طھ ==========

export async function getCampaignById(id: number): Promise<Campaign | undefined> {
  const { rows } = await pool.query('SELECT * FROM campaigns WHERE id = $1', [id]);
  return rows[0] ? toCampaign(rows[0]) : undefined;
}

export async function createCampaign(
  userId: number,
  channelUsername: string,
  channelName: string,
  targetSubscribers: number,
  pointsPaid: number,
): Promise<Campaign> {
  const { rows } = await pool.query(`
    INSERT INTO campaigns (user_id, channel_username, channel_name, target_subscribers, points_paid)
    VALUES ($1, $2, $3, $4, $5) RETURNING *
  `, [userId, channelUsername, channelName, targetSubscribers, pointsPaid]);
  return toCampaign(rows[0]);
}

export async function getNextPendingCampaign(userId: number, excludeIds: number[] = []): Promise<Campaign | undefined> {
  const placeholders = excludeIds.length
    ? `AND id NOT IN (${excludeIds.map((_, i) => `$${i + 2}`).join(', ')})`
    : '';
  const { rows } = await pool.query(`
    SELECT * FROM campaigns
    WHERE status = 'active'
      AND user_id != $1
      AND id NOT IN (SELECT campaign_id FROM campaign_subscriptions WHERE user_id = $1)
      ${placeholders}
    ORDER BY created_at ASC LIMIT 1
  `, [userId, ...excludeIds]);
  return rows[0] ? toCampaign(rows[0]) : undefined;
}

export async function hasSubscribedToCampaign(userId: number, campaignId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM campaign_subscriptions WHERE user_id = $1 AND campaign_id = $2',
    [userId, campaignId],
  );
  return rows.length > 0;
}

export async function recordCampaignSubscription(
  userId: number,
  campaignId: number,
  pointsReward: number,
): Promise<{ success: boolean; campaignCompleted: boolean }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const insertResult = await client.query(
      'INSERT INTO campaign_subscriptions (user_id, campaign_id) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING id',
      [userId, campaignId],
    );

    if (insertResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, campaignCompleted: false };
    }

    const updateCampaignResult = await client.query(
      'UPDATE campaigns SET completed_subscribers = completed_subscribers + 1 WHERE id = $1 RETURNING *',
      [campaignId],
    );

    if (updateCampaignResult.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, campaignCompleted: false };
    }

    const campaign = toCampaign(updateCampaignResult.rows[0]);
    const campaignCompleted = campaign.completed_subscribers >= campaign.target_subscribers;

    if (campaignCompleted) {
      await client.query("UPDATE campaigns SET status = 'completed' WHERE id = $1", [campaignId]);
    }

    const pointUpdate = await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [pointsReward, userId]);
    if (pointUpdate.rowCount === 0) {
      await client.query('ROLLBACK');
      return { success: false, campaignCompleted: false };
    }

    await client.query('COMMIT');
    return { success: true, campaignCompleted };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

export async function stopCampaign(id: number): Promise<void> {
  await pool.query("UPDATE campaigns SET status = 'stopped' WHERE id = $1", [id]);
}

export async function deleteCampaignById(id: number): Promise<void> {
  await pool.query('DELETE FROM campaign_subscriptions WHERE campaign_id = $1', [id]);
  await pool.query('DELETE FROM campaigns WHERE id = $1', [id]);
}

export async function getActiveCampaigns(): Promise<Campaign[]> {
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at DESC");
  return rows.map(toCampaign);
}

export async function getCompletedCampaigns(): Promise<Campaign[]> {
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE status = 'completed' ORDER BY created_at DESC LIMIT 20");
  return rows.map(toCampaign);
}

export async function getUserCampaignsCount(userId: number): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM campaigns WHERE user_id = $1', [userId]);
  return Number(rows[0].c);
}

export async function getCampaignsCount(): Promise<number> {
  const { rows } = await pool.query("SELECT COUNT(*) as c FROM campaigns WHERE status = 'active'");
  return Number(rows[0].c);
}

// ========== ط¥ط­طµط§ط¦ظٹط§طھ ==========

export async function getTasksCount(): Promise<number> {
  const { rows: r1 } = await pool.query('SELECT COUNT(*) as c FROM completed_tasks');
  const { rows: r2 } = await pool.query('SELECT COUNT(*) as c FROM campaign_subscriptions');
  return Number(r1[0].c) + Number(r2[0].c);
}

export async function getTotalPointsCirculated(): Promise<number> {
  const { rows: r1 } = await pool.query('SELECT COALESCE(SUM(points_reward), 0) as t FROM channels');
  const { rows: r2 } = await pool.query('SELECT COALESCE(SUM(points_paid), 0) as t FROM campaigns');
  return Number(r1[0].t) + Number(r2[0].t);
}

// ========== ط§ظ„ظ…ظƒط§ظپط£ط© ط§ظ„ظٹظˆظ…ظٹط© ==========

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getDailyClaimStatus(userId: number): Promise<DailyClaimStatus> {
  const today = getTodayUTC();
  const { rows } = await pool.query(
    'SELECT claimed_date FROM daily_claims WHERE user_id = $1 AND claimed_date = $2',
    [userId, today],
  );
  return { canClaim: rows.length === 0, lastClaimDate: rows[0]?.claimed_date ?? null };
}

export async function claimDailyBonus(userId: number, points: number): Promise<{ success: boolean }> {
  const today = getTodayUTC();
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    try {
      await client.query(
        'INSERT INTO daily_claims (user_id, claimed_date, points_earned) VALUES ($1, $2, $3)',
        [userId, today, points],
      );
    } catch {
      await client.query('ROLLBACK');
      return { success: false };
    }
    await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [points, userId]);
    await client.query('COMMIT');
    return { success: true };
  } catch {
    await client.query('ROLLBACK');
    return { success: false };
  } finally {
    client.release();
  }
}

// ========== ط§ظ„ط¥ط¹ط¯ط§ط¯ط§طھ ==========

export async function getSetting(key: string): Promise<string | null> {
  const { rows } = await pool.query('SELECT value FROM settings WHERE key = $1', [key]);
  return rows[0]?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await pool.query(`
    INSERT INTO settings (key, value) VALUES ($1, $2)
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()
  `, [key, value]);
}

