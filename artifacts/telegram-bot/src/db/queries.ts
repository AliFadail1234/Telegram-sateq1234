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
  added_by_type: string;
  added_by_user_id: number | null;
  created_at: string;
}

// ========== مساعد تحويل الأنواع ==========
// node:sqlite يعيد bigint للأعداد الصحيحة — نحوّلها لـ number

function toUser(row: Record<string, unknown>): User {
  return {
    id: Number(row['id']),
    telegram_id: Number(row['telegram_id']),
    username: row['username'] as string | null,
    first_name: row['first_name'] as string,
    last_name: row['last_name'] as string | null,
    points: Number(row['points']),
    created_at: row['created_at'] as string,
  };
}

function toChannel(row: Record<string, unknown>): Channel {
  return {
    id: Number(row['id']),
    channel_username: row['channel_username'] as string,
    channel_name: row['channel_name'] as string,
    points_reward: Number(row['points_reward']),
    is_active: Number(row['is_active']),
    added_by_type: row['added_by_type'] as string,
    added_by_user_id: row['added_by_user_id'] != null ? Number(row['added_by_user_id']) : null,
    created_at: row['created_at'] as string,
  };
}

// ========== استعلامات المستخدمين ==========

export function getUserByTelegramId(telegramId: number): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as Record<string, unknown> | undefined;
  return row ? toUser(row) : undefined;
}

export function getUserById(id: number): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? toUser(row) : undefined;
}

export function createUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): User {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, username)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(telegramId, firstName, lastName ?? null, username ?? null) as { lastInsertRowid: number | bigint };
  return getUserById(Number(result.lastInsertRowid))!;
}

export function getOrCreateUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): { user: User; isNew: boolean } {
  const existing = getUserByTelegramId(telegramId);
  if (existing) return { user: existing, isNew: false };
  const newUser = createUser(telegramId, firstName, lastName, username);
  return { user: newUser, isNew: true };
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
  const row = db.prepare('SELECT COUNT(*) as count FROM users').get() as Record<string, unknown>;
  return Number(row['count']);
}

export function searchUserByUsername(username: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE username LIKE ?').get(`%${username}%`) as Record<string, unknown> | undefined;
  return row ? toUser(row) : undefined;
}

export function searchUserByTelegramId(telegramId: number): User | undefined {
  return getUserByTelegramId(telegramId);
}

// ========== استعلامات القنوات ==========

export function getActiveChannels(): Channel[] {
  const rows = db.prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at DESC').all() as Record<string, unknown>[];
  return rows.map(toChannel);
}

export function getChannelById(id: number): Channel | undefined {
  const row = db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? toChannel(row) : undefined;
}

export function createChannel(channelUsername: string, channelName: string, pointsReward: number, addedByType: 'admin' | 'user', addedByUserId: number | null): Channel {
  const stmt = db.prepare(`
    INSERT INTO channels (channel_username, channel_name, points_reward, added_by_type, added_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(channelUsername, channelName, pointsReward, addedByType, addedByUserId ?? null) as { lastInsertRowid: number | bigint };
  return getChannelById(Number(result.lastInsertRowid))!;
}

export function deleteChannel(id: number): void {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
}

export function updateChannelPoints(id: number, points: number): void {
  db.prepare('UPDATE channels SET points_reward = ? WHERE id = ?').run(points, id);
}

export function getChannelsCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM channels WHERE is_active = 1').get() as Record<string, unknown>;
  return Number(row['count']);
}

// ========== استعلامات المهام ==========

export function hasCompletedTask(userId: number, channelId: number): boolean {
  const result = db.prepare('SELECT id FROM completed_tasks WHERE user_id = ? AND channel_id = ?').get(userId, channelId);
  return !!result;
}

export function completeTask(userId: number, channelId: number): boolean {
  try {
    db.prepare('INSERT INTO completed_tasks (user_id, channel_id) VALUES (?, ?)').run(userId, channelId);
    return true;
  } catch {
    return false;
  }
}

export function getUserCompletedTasksCount(userId: number): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM completed_tasks WHERE user_id = ?').get(userId) as Record<string, unknown>;
  return Number(row['count']);
}

export function getTasksCount(): number {
  const row = db.prepare('SELECT COUNT(*) as count FROM completed_tasks').get() as Record<string, unknown>;
  return Number(row['count']);
}

export function getTotalPointsCirculated(): number {
  const row = db.prepare('SELECT SUM(points_reward) as total FROM channels').get() as Record<string, unknown>;
  return Number(row['total'] ?? 0);
}

export function getNextPendingChannel(userId: number): Channel | undefined {
  const row = db.prepare(`
    SELECT c.* FROM channels c
    WHERE c.is_active = 1
    AND c.id NOT IN (
      SELECT channel_id FROM completed_tasks WHERE user_id = ?
    )
    ORDER BY c.created_at ASC
    LIMIT 1
  `).get(userId) as Record<string, unknown> | undefined;
  return row ? toChannel(row) : undefined;
}

export function getUserPromotedChannelsCount(userId: number): number {
  const row = db.prepare(`
    SELECT COUNT(*) as count FROM channels
    WHERE added_by_type = 'user' AND added_by_user_id = ?
  `).get(userId) as Record<string, unknown>;
  return Number(row['count']);
}

// ========== استعلامات المكافأة اليومية ==========

export interface DailyClaimStatus {
  canClaim: boolean;
  lastClaimDate: string | null;
}

function getTodayUTC(): string {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD
}

export function getDailyClaimStatus(userId: number): DailyClaimStatus {
  const today = getTodayUTC();
  const row = db.prepare(
    'SELECT claimed_date FROM daily_claims WHERE user_id = ? AND claimed_date = ?'
  ).get(userId, today) as Record<string, unknown> | undefined;

  return {
    canClaim: !row,
    lastClaimDate: row ? (row['claimed_date'] as string) : null,
  };
}

export function claimDailyBonus(userId: number, points: number): { success: boolean } {
  const today = getTodayUTC();
  try {
    db.prepare(
      'INSERT INTO daily_claims (user_id, claimed_date, points_earned) VALUES (?, ?, ?)'
    ).run(userId, today, points);
    addPoints(userId, points);
    return { success: true };
  } catch {
    return { success: false }; // سبق الاستلام (UNIQUE constraint)
  }
}
