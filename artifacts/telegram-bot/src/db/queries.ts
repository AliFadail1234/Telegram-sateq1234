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

export interface CompletedTask {
  id: number;
  user_id: number;
  channel_id: number;
  completed_at: string;
}

// ========== استعلامات المستخدمين ==========

export function getUserByTelegramId(telegramId: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE telegram_id = ?').get(telegramId) as User | undefined;
}

export function getUserById(id: number): User | undefined {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User | undefined;
}

export function createUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): User {
  const stmt = db.prepare(`
    INSERT INTO users (telegram_id, first_name, last_name, username)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(telegramId, firstName, lastName, username);
  return getUserById(result.lastInsertRowid as number)!;
}

export function getOrCreateUser(telegramId: number, firstName: string, lastName: string | null, username: string | null): { user: User; isNew: boolean } {
  const existing = getUserByTelegramId(telegramId);
  if (existing) {
    return { user: existing, isNew: false };
  }
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

export function getAllUsers(): User[] {
  return db.prepare('SELECT * FROM users ORDER BY created_at DESC').all() as User[];
}

export function getUsersCount(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM users').get() as { count: number };
  return result.count;
}

export function searchUserByUsername(username: string): User | undefined {
  return db.prepare('SELECT * FROM users WHERE username LIKE ?').get(`%${username}%`) as User | undefined;
}

export function searchUserByTelegramId(telegramId: number): User | undefined {
  return getUserByTelegramId(telegramId);
}

// ========== استعلامات القنوات ==========

export function getActiveChannels(): Channel[] {
  return db.prepare('SELECT * FROM channels WHERE is_active = 1 ORDER BY created_at DESC').all() as Channel[];
}

export function getChannelById(id: number): Channel | undefined {
  return db.prepare('SELECT * FROM channels WHERE id = ?').get(id) as Channel | undefined;
}

export function createChannel(channelUsername: string, channelName: string, pointsReward: number, addedByType: 'admin' | 'user', addedByUserId: number | null): Channel {
  const stmt = db.prepare(`
    INSERT INTO channels (channel_username, channel_name, points_reward, added_by_type, added_by_user_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const result = stmt.run(channelUsername, channelName, pointsReward, addedByType, addedByUserId);
  return getChannelById(result.lastInsertRowid as number)!;
}

export function deleteChannel(id: number): void {
  db.prepare('DELETE FROM channels WHERE id = ?').run(id);
}

export function updateChannelPoints(id: number, points: number): void {
  db.prepare('UPDATE channels SET points_reward = ? WHERE id = ?').run(points, id);
}

export function getChannelsCount(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM channels WHERE is_active = 1').get() as { count: number };
  return result.count;
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
    return false; // المهمة مكتملة مسبقاً (UNIQUE constraint)
  }
}

export function getUserCompletedTasksCount(userId: number): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM completed_tasks WHERE user_id = ?').get(userId) as { count: number };
  return result.count;
}

export function getTasksCount(): number {
  const result = db.prepare('SELECT COUNT(*) as count FROM completed_tasks').get() as { count: number };
  return result.count;
}

export function getTotalPointsCirculated(): number {
  const result = db.prepare('SELECT SUM(points_reward) as total FROM channels').get() as { total: number | null };
  return result.total ?? 0;
}

// الحصول على القناة التالية غير المكتملة للمستخدم
export function getNextPendingChannel(userId: number): Channel | undefined {
  return db.prepare(`
    SELECT c.* FROM channels c
    WHERE c.is_active = 1
    AND c.id NOT IN (
      SELECT channel_id FROM completed_tasks WHERE user_id = ?
    )
    ORDER BY c.created_at ASC
    LIMIT 1
  `).get(userId) as Channel | undefined;
}

// عدد القنوات التي روّج لها المستخدم
export function getUserPromotedChannelsCount(userId: number): number {
  const result = db.prepare(`
    SELECT COUNT(*) as count FROM channels
    WHERE added_by_type = 'user' AND added_by_user_id = ?
  `).get(userId) as { count: number };
  return result.count;
}
