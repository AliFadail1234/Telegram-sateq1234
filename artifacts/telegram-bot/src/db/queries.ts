import { pool } from './database.js';

// ========== أنواع البيانات ==========

export interface User {
  id: number;
  telegram_id: number;
  username: string | null;
  first_name: string;
  last_name: string | null;
  points: number;
  is_banned: number;
  referral_count: number;
  referrer_id: number | null;
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

export interface PointTransaction {
  id: number;
  user_id: number;
  type: string;
  amount: number;
  description: string | null;
  related_id: number | null;
  created_at: string;
}

export interface Admin {
  id: number;
  telegram_id: number;
  username: string | null;
  permissions: string;
  added_by: number | null;
  created_at: string;
}

export interface Broadcast {
  id: number;
  message: string;
  status: string;
  total_sent: number;
  total_failed: number;
  created_at: string;
}

// ========== مساعدو تحويل الأنواع ==========

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toUser(r: any): User {
  return {
    id: Number(r.id),
    telegram_id: Number(r.telegram_id),
    username: r.username ?? null,
    first_name: r.first_name,
    last_name: r.last_name ?? null,
    points: Number(r.points),
    is_banned: Number(r.is_banned ?? 0),
    referral_count: Number(r.referral_count ?? 0),
    referrer_id: r.referrer_id ? Number(r.referrer_id) : null,
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

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toTransaction(r: any): PointTransaction {
  return {
    id: Number(r.id),
    user_id: Number(r.user_id),
    type: r.type,
    amount: Number(r.amount),
    description: r.description ?? null,
    related_id: r.related_id ? Number(r.related_id) : null,
    created_at: r.created_at,
  };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toAdmin(r: any): Admin {
  return {
    id: Number(r.id),
    telegram_id: Number(r.telegram_id),
    username: r.username ?? null,
    permissions: r.permissions,
    added_by: r.added_by ? Number(r.added_by) : null,
    created_at: r.created_at,
  };
}

// ========== المستخدمون ==========

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

export async function addPoints(userId: number, points: number, type = 'earn', description?: string): Promise<void> {
  await pool.query('UPDATE users SET points = points + $1 WHERE id = $2', [points, userId]);
  await addTransaction(userId, type, points, description ?? `إضافة ${points} نقطة`);
}

export async function deductPoints(userId: number, points: number): Promise<boolean> {
  const { rowCount } = await pool.query(
    'UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1',
    [points, userId],
  );
  if ((rowCount ?? 0) > 0) {
    await addTransaction(userId, 'deduct', -points, `خصم ${points} نقطة`);
    return true;
  }
  return false;
}

export async function getUsersCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM users');
  return Number(rows[0].c);
}

export async function getTodayUsersCount(): Promise<number> {
  const { rows } = await pool.query("SELECT COUNT(*) as c FROM users WHERE DATE(created_at AT TIME ZONE 'UTC') = CURRENT_DATE");
  return Number(rows[0].c);
}

export async function getMonthUsersCount(): Promise<number> {
  const { rows } = await pool.query("SELECT COUNT(*) as c FROM users WHERE created_at >= date_trunc('month', NOW())");
  return Number(rows[0].c);
}

export async function getActiveUsersCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM users WHERE is_banned = 0');
  return Number(rows[0].c);
}

export async function searchUserByUsername(username: string): Promise<User | undefined> {
  const { rows } = await pool.query('SELECT * FROM users WHERE username ILIKE $1', [`%${username}%`]);
  return rows[0] ? toUser(rows[0]) : undefined;
}

export async function searchUserByTelegramId(telegramId: number): Promise<User | undefined> {
  return getUserByTelegramId(telegramId);
}

export async function searchUsers(query: string, limit = 50, offset = 0): Promise<User[]> {
  if (!query) {
    const { rows } = await pool.query('SELECT * FROM users ORDER BY points DESC, created_at DESC LIMIT $1 OFFSET $2', [limit, offset]);
    return rows.map(toUser);
  }
  const isNumeric = /^\d+$/.test(query);
  if (isNumeric) {
    const { rows } = await pool.query(
      'SELECT * FROM users WHERE telegram_id = $1 OR CAST(id AS TEXT) = $1 ORDER BY points DESC LIMIT $2 OFFSET $3',
      [query, limit, offset],
    );
    return rows.map(toUser);
  }
  const { rows } = await pool.query(
    `SELECT * FROM users WHERE username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1
     ORDER BY points DESC, created_at DESC LIMIT $2 OFFSET $3`,
    [`%${query}%`, limit, offset],
  );
  return rows.map(toUser);
}

export async function searchUsersCount(query: string): Promise<number> {
  if (!query) {
    const { rows } = await pool.query('SELECT COUNT(*) as c FROM users');
    return Number(rows[0].c);
  }
  const isNumeric = /^\d+$/.test(query);
  if (isNumeric) {
    const { rows } = await pool.query('SELECT COUNT(*) as c FROM users WHERE telegram_id = $1 OR CAST(id AS TEXT) = $1', [query]);
    return Number(rows[0].c);
  }
  const { rows } = await pool.query(
    'SELECT COUNT(*) as c FROM users WHERE username ILIKE $1 OR first_name ILIKE $1 OR last_name ILIKE $1',
    [`%${query}%`],
  );
  return Number(rows[0].c);
}

export async function getAllUsers(limit = 100, offset = 0): Promise<User[]> {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY points DESC LIMIT $1 OFFSET $2', [limit, offset]);
  return rows.map(toUser);
}

export async function exportAllUsers(): Promise<User[]> {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY id ASC');
  return rows.map(toUser);
}

export async function getAllUsersForBroadcast(): Promise<{ id: number; telegram_id: number }[]> {
  const { rows } = await pool.query('SELECT id, telegram_id FROM users WHERE is_banned = 0 ORDER BY id');
  return rows.map(r => ({ id: Number(r.id), telegram_id: Number(r.telegram_id) }));
}

export async function setUserPoints(userId: number, points: number): Promise<void> {
  const prev = await getUserById(userId);
  await pool.query('UPDATE users SET points = $1 WHERE id = $2', [points, userId]);
  const diff = points - (prev?.points ?? 0);
  await addTransaction(userId, 'admin_set', diff, `ضبط النقاط على ${points} (بواسطة الأدمن)`);
}

export async function banUser(userId: number, ban: boolean): Promise<void> {
  await pool.query('UPDATE users SET is_banned = $1 WHERE id = $2', [ban ? 1 : 0, userId]);
}

export async function isUserBanned(telegramId: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT is_banned FROM users WHERE telegram_id = $1', [telegramId]);
  return rows[0] ? Number(rows[0].is_banned) === 1 : false;
}

export async function getTopUsers(limit = 10): Promise<User[]> {
  const { rows } = await pool.query('SELECT * FROM users ORDER BY points DESC LIMIT $1', [limit]);
  return rows.map(toUser);
}

export async function getTopReferrers(limit = 10): Promise<User[]> {
  const { rows } = await pool.query('SELECT * FROM users WHERE referral_count > 0 ORDER BY referral_count DESC LIMIT $1', [limit]);
  return rows.map(toUser);
}

export async function incrementReferralCount(referrerId: number): Promise<void> {
  await pool.query('UPDATE users SET referral_count = referral_count + 1 WHERE id = $1', [referrerId]);
}

/** @deprecated استخدم recordPendingReferral الجديدة — مُبقى للتوافق */
export async function recordReferral(referrerId: number, referredId: number, rewardPoints: number): Promise<boolean> {
  return recordPendingReferral(referrerId, referredId, rewardPoints, 3);
}

// ========== قنوات الأدمن ==========

export async function getActiveChannels(): Promise<Channel[]> {
  const { rows } = await pool.query('SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at DESC');
  return rows.map(toChannel);
}

export async function getAllChannels(): Promise<Channel[]> {
  const { rows } = await pool.query('SELECT * FROM channels ORDER BY created_at DESC');
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

export async function toggleChannelActive(id: number, active: boolean): Promise<void> {
  await pool.query('UPDATE channels SET is_active = $1 WHERE id = $2', [active ? 1 : 0, id]);
}

export async function getChannelsCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM channels WHERE is_active = 1');
  return Number(rows[0].c);
}

export async function getChannelCompletionsCount(channelId: number): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM completed_tasks WHERE channel_id = $1', [channelId]);
  return Number(rows[0].c);
}

// ========== مهام قنوات الأدمن ==========

export async function hasCompletedTask(userId: number, channelId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'SELECT id FROM completed_tasks WHERE user_id = $1 AND channel_id = $2',
    [userId, channelId],
  );
  return rows.length > 0;
}

export async function completeTask(userId: number, channelId: number): Promise<boolean> {
  try {
    await pool.query('INSERT INTO completed_tasks (user_id, channel_id) VALUES ($1, $2)', [userId, channelId]);
    return true;
  } catch { return false; }
}

export async function getUserCompletedTasksCount(userId: number): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM completed_tasks WHERE user_id = $1', [userId]);
  return Number(rows[0].c);
}

export async function getNextPendingChannel(userId: number, excludeIds: number[] = []): Promise<Channel | undefined> {
  const excluded = [...excludeIds];
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

// ========== الحملات ==========

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
    // تسجيل المعاملة
    await addTransaction(userId, 'earn_campaign', pointsReward, `اشتراك في حملة #${campaignId}`, campaignId);
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
  const { rows } = await pool.query("SELECT * FROM campaigns WHERE status IN ('completed','stopped') ORDER BY created_at DESC LIMIT 50");
  return rows.map(toCampaign);
}

export async function getAllCampaigns(): Promise<Campaign[]> {
  const { rows } = await pool.query('SELECT * FROM campaigns ORDER BY created_at DESC LIMIT 100');
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

export async function getTotalCampaignsCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM campaigns');
  return Number(rows[0].c);
}

// ========== إحصائيات ==========

export async function getTasksCount(): Promise<number> {
  const { rows: r1 } = await pool.query('SELECT COUNT(*) as c FROM completed_tasks');
  const { rows: r2 } = await pool.query('SELECT COUNT(*) as c FROM campaign_subscriptions');
  return Number(r1[0].c) + Number(r2[0].c);
}

export async function getTotalPointsCirculated(): Promise<number> {
  const { rows } = await pool.query('SELECT COALESCE(SUM(points), 0) as t FROM users');
  return Number(rows[0].t);
}

export async function getChartData(days = 7): Promise<{ dates: string[]; users: number[]; tasks: number[]; campaigns: number[] }> {
  const { rows: userRows } = await pool.query(`
    SELECT DATE(created_at AT TIME ZONE 'UTC') as date, COUNT(*) as count
    FROM users
    WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
    GROUP BY DATE(created_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `, [days]);

  const { rows: taskRows } = await pool.query(`
    SELECT DATE(completed_at AT TIME ZONE 'UTC') as date, COUNT(*) as count
    FROM completed_tasks
    WHERE completed_at >= NOW() - ($1 || ' days')::INTERVAL
    GROUP BY DATE(completed_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `, [days]);

  const { rows: campaignRows } = await pool.query(`
    SELECT DATE(created_at AT TIME ZONE 'UTC') as date, COUNT(*) as count
    FROM campaigns
    WHERE created_at >= NOW() - ($1 || ' days')::INTERVAL
    GROUP BY DATE(created_at AT TIME ZONE 'UTC')
    ORDER BY date ASC
  `, [days]);

  const dates: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const toMap = (rows: {date: string; count: string}[]) => Object.fromEntries(rows.map(r => [r.date.slice(0,10), Number(r.count)]));
  const uMap = toMap(userRows as {date: string; count: string}[]);
  const tMap = toMap(taskRows as {date: string; count: string}[]);
  const cMap = toMap(campaignRows as {date: string; count: string}[]);

  return {
    dates,
    users: dates.map(d => uMap[d] ?? 0),
    tasks: dates.map(d => tMap[d] ?? 0),
    campaigns: dates.map(d => cMap[d] ?? 0),
  };
}

export async function getRecentActivity(limit = 20): Promise<{type: string; description: string; created_at: string}[]> {
  const { rows } = await pool.query(`
    (SELECT 'user' as type, 'مستخدم جديد: ' || first_name as description, created_at FROM users ORDER BY created_at DESC LIMIT $1)
    UNION ALL
    (SELECT 'task' as type, 'مهمة مكتملة #' || channel_id as description, completed_at as created_at FROM completed_tasks ORDER BY completed_at DESC LIMIT $1)
    UNION ALL
    (SELECT 'campaign' as type, 'حملة جديدة: ' || channel_name as description, created_at FROM campaigns ORDER BY created_at DESC LIMIT $1)
    ORDER BY created_at DESC LIMIT $1
  `, [limit]);
  return rows.map(r => ({ type: String(r.type), description: String(r.description), created_at: String(r.created_at) }));
}

// ========== معاملات النقاط ==========

export async function addTransaction(userId: number, type: string, amount: number, description?: string, relatedId?: number): Promise<void> {
  try {
    await pool.query(
      'INSERT INTO point_transactions (user_id, type, amount, description, related_id) VALUES ($1, $2, $3, $4, $5)',
      [userId, type, amount, description ?? null, relatedId ?? null],
    );
  } catch { /* لا نوقف تدفق العمل بسبب فشل تسجيل المعاملة */ }
}

export async function getUserTransactions(userId: number, limit = 50): Promise<PointTransaction[]> {
  const { rows } = await pool.query(
    'SELECT * FROM point_transactions WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2',
    [userId, limit],
  );
  return rows.map(toTransaction);
}

export async function getAllTransactions(limit = 100, offset = 0): Promise<PointTransaction[]> {
  const { rows } = await pool.query(
    'SELECT * FROM point_transactions ORDER BY created_at DESC LIMIT $1 OFFSET $2',
    [limit, offset],
  );
  return rows.map(toTransaction);
}

export async function exportAllTransactions(): Promise<PointTransaction[]> {
  const { rows } = await pool.query('SELECT * FROM point_transactions ORDER BY id ASC');
  return rows.map(toTransaction);
}

export async function getTransactionsCount(): Promise<number> {
  const { rows } = await pool.query('SELECT COUNT(*) as c FROM point_transactions');
  return Number(rows[0].c);
}

// ========== المشرفون ==========

export async function getAdmins(): Promise<Admin[]> {
  const { rows } = await pool.query('SELECT * FROM admins ORDER BY created_at ASC');
  return rows.map(toAdmin);
}

export async function addAdmin(telegramId: number, username: string | null, permissions = 'all', addedBy?: number): Promise<Admin> {
  const { rows } = await pool.query(
    'INSERT INTO admins (telegram_id, username, permissions, added_by) VALUES ($1, $2, $3, $4) ON CONFLICT (telegram_id) DO UPDATE SET username = EXCLUDED.username, permissions = EXCLUDED.permissions RETURNING *',
    [telegramId, username, permissions, addedBy ?? null],
  );
  return toAdmin(rows[0]);
}

export async function removeAdmin(id: number): Promise<void> {
  await pool.query('DELETE FROM admins WHERE id = $1', [id]);
}

export async function isAdminUser(telegramId: number): Promise<boolean> {
  const { rows } = await pool.query('SELECT id FROM admins WHERE telegram_id = $1', [telegramId]);
  return rows.length > 0;
}

// ========== الإذاعة ==========

export async function saveBroadcast(message: string, totalSent: number, totalFailed: number): Promise<Broadcast> {
  const { rows } = await pool.query(
    'INSERT INTO broadcasts (message, total_sent, total_failed) VALUES ($1, $2, $3) RETURNING *',
    [message, totalSent, totalFailed],
  );
  return {
    id: Number(rows[0].id),
    message: rows[0].message,
    status: rows[0].status,
    total_sent: Number(rows[0].total_sent),
    total_failed: Number(rows[0].total_failed),
    created_at: rows[0].created_at,
  };
}

export async function getBroadcasts(limit = 20): Promise<Broadcast[]> {
  const { rows } = await pool.query('SELECT * FROM broadcasts ORDER BY created_at DESC LIMIT $1', [limit]);
  return rows.map(r => ({
    id: Number(r.id),
    message: r.message,
    status: r.status,
    total_sent: Number(r.total_sent),
    total_failed: Number(r.total_failed),
    created_at: r.created_at,
  }));
}

// ========== المكافأة اليومية (مبنية على الفترة الزمنية) ==========

export async function getDailyClaimStatus(userId: number, intervalHours: number = 24): Promise<{ canClaim: boolean; msUntilNext: number }> {
  const { rows } = await pool.query(
    'SELECT claimed_at FROM daily_claims WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 1',
    [userId],
  );
  if (!rows[0]) return { canClaim: true, msUntilNext: 0 };
  const lastAt = new Date(rows[0].claimed_at).getTime();
  const remaining = lastAt + intervalHours * 3600000 - Date.now();
  return { canClaim: remaining <= 0, msUntilNext: Math.max(0, remaining) };
}

/**
 * يتحقق ويُنفّذ المطالبة بالمكافأة مع دعم الفترة الزمنية المخصصة.
 * @param intervalHours  الفترة بالساعات (مثلاً 24 أو 12 أو 1)
 * @returns success + msUntilNext (مدة الانتظار بالميلي ثانية إذا فشل)
 */
export async function claimDailyBonus(
  userId: number,
  points: number,
  intervalHours: number = 24,
): Promise<{ success: boolean; msUntilNext?: number }> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // أحدث مطالبة لهذا المستخدم
    const { rows: last } = await client.query(
      'SELECT claimed_at FROM daily_claims WHERE user_id = $1 ORDER BY claimed_at DESC LIMIT 1',
      [userId],
    );
    if (last[0]) {
      const lastAt = new Date(last[0].claimed_at).getTime();
      const intervalMs = intervalHours * 3600 * 1000;
      const remaining = lastAt + intervalMs - Date.now();
      if (remaining > 0) {
        await client.query('ROLLBACK');
        return { success: false, msUntilNext: remaining };
      }
    }
    const today = new Date().toISOString().slice(0, 10);
    await client.query(
      'INSERT INTO daily_claims (user_id, claimed_date, points_earned) VALUES ($1, $2, $3)',
      [userId, today, points],
    );
    await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [points, userId]);
    await client.query('COMMIT');
    await addTransaction(userId, 'daily_bonus', points, 'مكافأة يومية');
    return { success: true };
  } catch {
    await client.query('ROLLBACK');
    return { success: false };
  } finally {
    client.release();
  }
}

// ========== تحويل النقاط بين المستخدمين ==========

export async function transferPoints(
  senderId: number,
  recipientId: number,
  amount: number,
  commission: number,
): Promise<'ok' | 'insufficient' | 'same_user'> {
  if (senderId === recipientId) return 'same_user';
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query('SELECT points FROM users WHERE id = $1 FOR UPDATE', [senderId]);
    if (!rows[0] || rows[0].points < amount) {
      await client.query('ROLLBACK');
      return 'insufficient';
    }
    const recipientGets = amount - commission;
    await client.query('UPDATE users SET points = points - $1 WHERE id = $2', [amount, senderId]);
    await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [recipientGets, recipientId]);
    await client.query('COMMIT');
    await addTransaction(senderId, 'transfer_out', -amount, `تحويل نقاط إلى مستخدم (عمولة ${commission})`, recipientId);
    await addTransaction(recipientId, 'transfer_in', recipientGets, 'استلام نقاط محوّلة', senderId);
    return 'ok';
  } catch {
    await client.query('ROLLBACK');
    throw new Error('خطأ في التحويل');
  } finally {
    client.release();
  }
}

// ========== الإعدادات ==========

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

export async function getAllSettings(): Promise<Record<string, string>> {
  const { rows } = await pool.query('SELECT key, value FROM settings');
  return Object.fromEntries(rows.map(r => [r.key, r.value]));
}

// ========== القنوات الإجبارية ==========

export interface MandatoryChannel {
  id: number;
  channel_username: string;
  channel_name: string;
  max_joins: number | null;
  current_joins: number;
  is_active: number;
  created_at: string;
}

export async function getMandatoryChannels(): Promise<MandatoryChannel[]> {
  const { rows } = await pool.query('SELECT * FROM mandatory_channels ORDER BY created_at ASC');
  return rows as MandatoryChannel[];
}

export async function getActiveMandatoryChannels(): Promise<MandatoryChannel[]> {
  const { rows } = await pool.query('SELECT * FROM mandatory_channels WHERE is_active = 1 ORDER BY created_at ASC');
  return rows as MandatoryChannel[];
}

export async function addMandatoryChannel(channelUsername: string, channelName: string, maxJoins: number | null): Promise<MandatoryChannel> {
  const { rows } = await pool.query(
    'INSERT INTO mandatory_channels (channel_username, channel_name, max_joins) VALUES ($1, $2, $3) RETURNING *',
    [channelUsername, channelName, maxJoins],
  );
  return rows[0] as MandatoryChannel;
}

export async function updateMandatoryChannel(id: number, channelName: string, maxJoins: number | null): Promise<void> {
  await pool.query('UPDATE mandatory_channels SET channel_name=$1, max_joins=$2 WHERE id=$3', [channelName, maxJoins, id]);
}

export async function toggleMandatoryChannel(id: number, isActive: boolean): Promise<void> {
  await pool.query('UPDATE mandatory_channels SET is_active=$1 WHERE id=$2', [isActive ? 1 : 0, id]);
}

export async function deleteMandatoryChannel(id: number): Promise<void> {
  await pool.query('DELETE FROM mandatory_channels WHERE id=$1', [id]);
}

/** يسجّل انضمام مستخدم لقناة إجبارية، ويُعيد true إذا وصلت للحد الأقصى وجب إيقافها */
export async function recordMandatoryJoin(channelId: number): Promise<boolean> {
  const { rows } = await pool.query(
    'UPDATE mandatory_channels SET current_joins = current_joins + 1 WHERE id=$1 RETURNING current_joins, max_joins',
    [channelId],
  );
  if (!rows[0]) return false;
  const { current_joins, max_joins } = rows[0];
  if (max_joins && current_joins >= max_joins) {
    await pool.query('UPDATE mandatory_channels SET is_active = 0 WHERE id=$1', [channelId]);
    return true; // وصلت للحد
  }
  return false;
}

// ========== الهدايا ==========

export interface PointGift {
  id: number;
  points: number;
  max_claims: number;
  current_claims: number;
  description: string | null;
  is_active: number;
  created_at: string;
}

export async function createGift(points: number, maxClaims: number, description: string | null): Promise<PointGift> {
  const { rows } = await pool.query(
    'INSERT INTO point_gifts (points, max_claims, description) VALUES ($1, $2, $3) RETURNING *',
    [points, maxClaims, description],
  );
  return rows[0] as PointGift;
}

export async function getGifts(): Promise<PointGift[]> {
  const { rows } = await pool.query('SELECT * FROM point_gifts ORDER BY created_at DESC');
  return rows as PointGift[];
}

export async function deactivateGift(id: number): Promise<void> {
  await pool.query('UPDATE point_gifts SET is_active = 0 WHERE id = $1', [id]);
}

export async function deleteGift(id: number): Promise<void> {
  await pool.query('DELETE FROM point_gifts WHERE id = $1', [id]);
}

export async function claimGift(giftId: number, userId: number): Promise<'ok' | 'already_claimed' | 'exhausted' | 'not_found'> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      'SELECT * FROM point_gifts WHERE id = $1 AND is_active = 1 FOR UPDATE',
      [giftId],
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return 'not_found'; }
    const gift = rows[0] as PointGift;
    if (gift.current_claims >= gift.max_claims) { await client.query('ROLLBACK'); return 'exhausted'; }
    // تحقق من أن المستخدم لم يطالب بهذه الهدية مسبقاً
    const dup = await client.query('SELECT id FROM gift_claims WHERE gift_id=$1 AND user_id=$2', [giftId, userId]);
    if (dup.rows.length > 0) { await client.query('ROLLBACK'); return 'already_claimed'; }
    // سجّل المطالبة وأضف النقاط
    await client.query('INSERT INTO gift_claims (gift_id, user_id) VALUES ($1, $2)', [giftId, userId]);
    await client.query('UPDATE point_gifts SET current_claims = current_claims + 1 WHERE id = $1', [giftId]);
    await client.query('UPDATE users SET points = points + $1 WHERE id = $2', [gift.points, userId]);
    await client.query('COMMIT');
    await addTransaction(userId, 'gift', gift.points, `هدية نقاط #${giftId}`, giftId);
    return 'ok';
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// ========== الدعوات المعلقة ==========

export async function recordPendingReferral(referrerId: number, referredId: number, rewardPoints: number, requiredTasks: number): Promise<boolean> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const upd = await client.query(
      'UPDATE users SET referrer_id = $1 WHERE id = $2 AND referrer_id IS NULL',
      [referrerId, referredId],
    );
    if ((upd.rowCount ?? 0) === 0) { await client.query('ROLLBACK'); return false; }
    await client.query(
      `INSERT INTO pending_referrals (referrer_id, referred_id, reward_points, required_tasks)
       VALUES ($1, $2, $3, $4) ON CONFLICT (referred_id) DO NOTHING`,
      [referrerId, referredId, rewardPoints, requiredTasks],
    );
    await client.query('COMMIT');
    return true;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

/** يُستدعى بعد كل إتمام مهمة. يُرجع نقاط المكافأة إذا تحقق الشرط، أو null. */
export async function checkPendingReferralOnTask(referredId: number): Promise<{ referrerId: number; telegramId: number; points: number } | null> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `SELECT pr.*, u.telegram_id AS referrer_telegram_id
       FROM pending_referrals pr
       JOIN users u ON u.id = pr.referrer_id
       WHERE pr.referred_id = $1 AND pr.is_rewarded = 0
       FOR UPDATE`,
      [referredId],
    );
    if (!rows[0]) { await client.query('ROLLBACK'); return null; }
    const pr = rows[0];
    const newCount = pr.tasks_completed + 1;
    await client.query('UPDATE pending_referrals SET tasks_completed = $1 WHERE id = $2', [newCount, pr.id]);
    if (newCount < pr.required_tasks) { await client.query('COMMIT'); return null; }
    // الشرط تحقق — أعطِ المُحيل نقاطه
    await client.query('UPDATE pending_referrals SET is_rewarded = 1 WHERE id = $1', [pr.id]);
    await client.query('UPDATE users SET referral_count = referral_count + 1, points = points + $1 WHERE id = $2', [pr.reward_points, pr.referrer_id]);
    await client.query('COMMIT');
    await addTransaction(pr.referrer_id, 'referral', pr.reward_points, 'مكافأة دعوة (بعد إتمام المهام)', referredId);
    return { referrerId: pr.referrer_id, telegramId: Number(pr.referrer_telegram_id), points: pr.reward_points };
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}
