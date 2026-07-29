import { db } from './database.js';

// ========== أنواع البيانات ==========

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

// ========== مساعدو تحويل الأنواع ==========

function toUser(r: Record<string, unknown>): User {
  return {
    id: Number(r['id']),
    telegram_id: Number(r['telegram_id']),
    username: r['username'] as string | null,
    first_name: r['first_name'] as string,
    last_name: r['last_name'] as string | null,
    points: Number(r['points']),
    created_at: r['created_at'] as string,
  };
}

function toChannel(r: Record<string, unknown>): Channel {
  return {
    id: Number(r['id']),
    channel_username: r['channel_username'] as string,
    channel_name: r['channel_name'] as string,
    points_reward: Number(r['points_reward']),
    is_active: Number(r['is_active']),
    created_at: r['created_at'] as string,
  };
}

function toCampaign(r: Record<string, unknown>): Campaign {
  return {
    id: Number(r['id']),
    user_id: Number(r['user_id']),
    channel_username: r['channel_username'] as string,
    channel_name: r['channel_name'] as string,
    target_subscribers: Number(r['target_subscribers']),
    completed_subscribers: Number(r['completed_subscribers']),
    points_paid: Number(r['points_paid']),
    status: r['status'] as Campaign['status'],
    created_at: r['created_at'] as string,
  };
}

// ========== المستخدمون ==========

export function getUserByTelegramId(telegramId: number): User | undefined {
  const r = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as Record<string, unknown> | undefined;
  return r ? toUser(r) : undefined;
}

export function getUserById(id: number): User | undefined {
  const r = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? toUser(r) : undefined;
}

export function createUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): User {
  const res = db.prepare('INSERT INTO users (telegram_id, first_name, last_name, username) VALUES (?, ?, ?, ?)')
    .run(telegramId, firstName, lastName ?? null, username ?? null) as { lastInsertRowid: number | bigint };
  return getUserById(Number(res.lastInsertRowid))!;
}

export function getOrCreateUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): { user: User; isNew: boolean } {
  const existing = getUserByTelegramId(telegramId);
  if (existing) return { user: existing, isNew: false };
  return { user: createUser(telegramId, firstName, lastName, username), isNew: true };
}

export function addPoints(userId: number, points: number): void {
  db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(points, userId);
}

export function deductPoints(userId: number, points: number): boolean {
  const user = getUserById(userId);
  if (!user || user.points < points) return false;
  db.prepare('UPDATE users SET points = points - ? WHERE id = ?').run(points, userId);
  return true;
}

export function getUsersCount(): number {
  return Number((db.prepare('SELECT COUNT(*) as c FROM users').get() as Record<string, unknown>)['c']);
}

export function searchUserByUsername(username: string): User | undefined {
  const r = db.prepare('SELECT * FROM users WHERE username LIKE ?').get(`%${username}%`) as Record<string, unknown> | undefined;
  return r ? toUser(r) : undefined;
}

export function searchUserByTelegramId(telegramId: number): User | undefined {
  return getUserByTelegramId(telegramId);
}

// ========== قنوات الأدمن ==========

export function getActiveChannels(): Channel[] {
  return (db.prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at DESC').all() as Record<string, unknown>[]).map(toChannel);
}

export function getChannelById(id: number): Channel | undefined {
  const r = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? toChannel(r) : undefined;
}

export function createChannel(username: string, name: string, pointsReward: number): Channel {
  const res = db.prepare('INSERT INTO channels (channel_username, channel_name, points_reward) VALUES (?, ?, ?)')
    .run(username, name, pointsReward) as { lastInsertRowid: number | bigint };
  return getChannelById(Number(res.lastInsertRowid))!;
}

export function deleteChannel(id: number): void {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
}

export function updateChannelPoints(id: number, points: number): void {
  db.prepare('UPDATE channels SET points_reward = ? WHERE id = ?').run(points, id);
}

export function getChannelsCount(): number {
  return Number((db.prepare('SELECT COUNT(*) as c FROM channels WHERE is_active = 1').get() as Record<string, unknown>)['c']);
}

// ========== مهام قنوات الأدمن ==========

export function hasCompletedTask(userId: number, channelId: number): boolean {
  return !!db.prepare('SELECT id FROM completed_tasks WHERE user_id = ? AND channel_id = ?').get(userId, channelId);
}

export function completeTask(userId: number, channelId: number): boolean {
  try {
    db.prepare('INSERT INTO completed_tasks (user_id, channel_id) VALUES (?, ?)').run(userId, channelId);
    return true;
  } catch { return false; }
}

export function getUserCompletedTasksCount(userId: number): number {
  return Number((db.prepare('SELECT COUNT(*) as c FROM completed_tasks WHERE user_id = ?').get(userId) as Record<string, unknown>)['c']);
}

export function getNextPendingChannel(userId: number): Channel | undefined {
  const r = db.prepare(`
    SELECT c.* FROM channels c
    WHERE c.is_active = 1
      AND c.id NOT IN (SELECT channel_id FROM completed_tasks WHERE user_id = ?)
    ORDER BY c.created_at ASC LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;
  return r ? toChannel(r) : undefined;
}

// ========== الحملات ==========

export function getCampaignById(id: number): Campaign | undefined {
  const r = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return r ? toCampaign(r) : undefined;
}

export function createCampaign(userId: number, channelUsername: string, channelName: string, targetSubscribers: number, pointsPaid: number): Campaign {
  const res = db.prepare(`
    INSERT INTO campaigns (user_id, channel_username, channel_name, target_subscribers, points_paid)
    VALUES (?, ?, ?, ?, ?)
  `).run(userId, channelUsername, channelName, targetSubscribers, pointsPaid) as { lastInsertRowid: number | bigint };
  return getCampaignById(Number(res.lastInsertRowid))!;
}

// الحملة التالية النشطة التي لم يشترك فيها المستخدم بعد
export function getNextPendingCampaign(userId: number): Campaign | undefined {
  const r = db.prepare(`
    SELECT * FROM campaigns
    WHERE status = 'active'
      AND user_id != ?
      AND id NOT IN (SELECT campaign_id FROM campaign_subscriptions WHERE user_id = ?)
    ORDER BY created_at ASC LIMIT 1
  `).get(userId, userId) as Record<string, unknown> | undefined;
  return r ? toCampaign(r) : undefined;
}

export function hasSubscribedToCampaign(userId: number, campaignId: number): boolean {
  return !!db.prepare('SELECT id FROM campaign_subscriptions WHERE user_id = ? AND campaign_id = ?').get(userId, campaignId);
}

// تسجيل الاشتراك + زيادة العداد + إغلاق الحملة إذا اكتملت
export function recordCampaignSubscription(userId: number, campaignId: number): { success: boolean; campaignCompleted: boolean } {
  try {
    db.prepare('INSERT INTO campaign_subscriptions (user_id, campaign_id) VALUES (?, ?)').run(userId, campaignId);
  } catch {
    return { success: false, campaignCompleted: false };
  }

  db.prepare('UPDATE campaigns SET completed_subscribers = completed_subscribers + 1 WHERE id = ?').run(campaignId);

  const campaign = getCampaignById(campaignId)!;
  const campaignCompleted = campaign.completed_subscribers >= campaign.target_subscribers;

  if (campaignCompleted) {
    db.prepare("UPDATE campaigns SET status = 'completed' WHERE id = ?").run(campaignId);
  }

  return { success: true, campaignCompleted };
}

export function stopCampaign(id: number): void {
  db.prepare("UPDATE campaigns SET status = 'stopped' WHERE id = ?").run(id);
}

export function deleteCampaignById(id: number): void {
  db.prepare('DELETE FROM campaign_subscriptions WHERE campaign_id = ?').run(id);
  db.prepare('DELETE FROM campaigns WHERE id = ?').run(id);
}

export function getActiveCampaigns(): Campaign[] {
  return (db.prepare("SELECT * FROM campaigns WHERE status = 'active' ORDER BY created_at DESC").all() as Record<string, unknown>[]).map(toCampaign);
}

export function getCompletedCampaigns(): Campaign[] {
  return (db.prepare("SELECT * FROM campaigns WHERE status = 'completed' ORDER BY created_at DESC LIMIT 20").all() as Record<string, unknown>[]).map(toCampaign);
}

export function getUserCampaignsCount(userId: number): number {
  return Number((db.prepare('SELECT COUNT(*) as c FROM campaigns WHERE user_id = ?').get(userId) as Record<string, unknown>)['c']);
}

export function getCampaignsCount(): number {
  return Number((db.prepare("SELECT COUNT(*) as c FROM campaigns WHERE status = 'active'").get() as Record<string, unknown>)['c']);
}

// ========== إحصائيات ==========

export function getTasksCount(): number {
  const tasks = Number((db.prepare('SELECT COUNT(*) as c FROM completed_tasks').get() as Record<string, unknown>)['c']);
  const subs = Number((db.prepare('SELECT COUNT(*) as c FROM campaign_subscriptions').get() as Record<string, unknown>)['c']);
  return tasks + subs;
}

export function getTotalPointsCirculated(): number {
  const fromChannels = Number((db.prepare('SELECT COALESCE(SUM(points_reward), 0) as t FROM channels').get() as Record<string, unknown>)['t']);
  const fromCampaigns = Number((db.prepare('SELECT COALESCE(SUM(points_paid), 0) as t FROM campaigns').get() as Record<string, unknown>)['t']);
  return fromChannels + fromCampaigns;
}

// ========== المكافأة اليومية ==========

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10);
}

export function getDailyClaimStatus(userId: number): DailyClaimStatus {
  const today = getTodayUTC();
  const r = db.prepare('SELECT claimed_date FROM daily_claims WHERE user_id = ? AND claimed_date = ?').get(userId, today) as Record<string, unknown> | undefined;
  return { canClaim: !r, lastClaimDate: r ? (r['claimed_date'] as string) : null };
}

export function claimDailyBonus(userId: number, points: number): { success: boolean } {
  const today = getTodayUTC();
  try {
    db.prepare('INSERT INTO daily_claims (user_id, claimed_date, points_earned) VALUES (?, ?, ?)').run(userId, today, points);
    addPoints(userId, points);
    return { success: true };
  } catch { return { success: false }; }
}
