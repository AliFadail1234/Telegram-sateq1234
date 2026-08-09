import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  getUsersCount, getTodayUsersCount, getActiveUsersCount,
  getChannelsCount, getCampaignsCount, getTotalCampaignsCount,
  getTasksCount, getTotalPointsCirculated, getChartData, getRecentActivity,
  getTopUsers, getTopReferrers,
  searchUsers, searchUsersCount, getUserById,
  getAllUsersForBroadcast, exportAllUsers, setUserPoints, banUser,
  getUserTransactions, getAllTransactions, getTransactionsCount, exportAllTransactions,
  getActiveChannels, getAllChannels, createChannel, deleteChannel,
  updateChannelPoints, toggleChannelActive, getChannelCompletionsCount,
  getActiveCampaigns, getCompletedCampaigns,
  stopCampaign, deleteCampaignById,
  getAdmins, addAdmin, removeAdmin,
  getBroadcasts, saveBroadcast,
  getAllSettings, setSetting,
  getGifts, createGift, deleteGift, deactivateGift,
  getMandatoryChannels, addMandatoryChannel, updateMandatoryChannel,
  toggleMandatoryChannel, deleteMandatoryChannel,
} from '../db/queries.js';
import {
  getActivePricingTiers,
  savePricingTiers,
  getPointsPerMember,
  savePointsPerMember,
} from '../config/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = path.join(__dirname, 'dashboard.html');
const DASHBOARD_HTML_FALLBACK = path.join(__dirname, '../src/admin/dashboard.html');

function getAdminPassword(): string | undefined {
  const raw = process.env.ADMIN_PASSWORD?.trim();
  if (raw) return raw;                          // موجودة وغير فارغة
  return process.env.NODE_ENV === 'production' ? undefined : 'admin';
}
const MAX_BODY_SIZE = 2 * 1024 * 1024;
const ADMIN_RATE_LIMIT_WINDOW_MS = 60_000;
const ADMIN_RATE_LIMIT_MAX_REQUESTS = 120;
const adminRateLimitStore = new Map<string, { count: number; expiresAt: number }>();

function getClientIp(req: IncomingMessage): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') return forwarded.split(',')[0].trim();
  if (Array.isArray(forwarded) && forwarded[0]) return forwarded[0].split(',')[0].trim();
  return req.socket.remoteAddress ?? 'unknown';
}

function isRateLimited(req: IncomingMessage): boolean {
  const ip = getClientIp(req);
  const now = Date.now();
  const existing = adminRateLimitStore.get(ip);
  if (!existing || existing.expiresAt <= now) {
    adminRateLimitStore.set(ip, { count: 1, expiresAt: now + ADMIN_RATE_LIMIT_WINDOW_MS });
    return false;
  }
  if (existing.count >= ADMIN_RATE_LIMIT_MAX_REQUESTS) return true;
  existing.count += 1;
  return false;
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function isAuthorized(req: IncomingMessage): boolean {
  const pw = getAdminPassword();
  if (!pw) return false;
  const auth = String(req.headers['authorization'] ?? '');
  if (auth.startsWith('Bearer ')) return safeCompare(auth.slice(7), pw);
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [, pwd] = decoded.split(':');
    return safeCompare(pwd ?? '', pw);
  }
  return false;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers['content-length'] ?? '0');
  if (contentLength > MAX_BODY_SIZE) { req.destroy(); return {}; }
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > MAX_BODY_SIZE) { req.destroy(); resolve({}); }
    });
    req.on('end', () => { try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

function json(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  setCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

async function sendTelegramMsg(chatId: number, text: string): Promise<boolean> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) return false;
  try {
    const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: 'HTML' }),
    });
    return r.ok;
  } catch { return false; }
}

function getQP(req: IncomingMessage, param: string, def = ''): string {
  const url = new URL(req.url ?? '/', 'http://localhost');
  return url.searchParams.get(param) ?? def;
}

export async function handleAdminRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const requestUrl = new URL(req.url ?? '/', 'http://localhost');
  const url = requestUrl.pathname;
  const method = req.method ?? 'GET';

  if (isRateLimited(req)) { json(req, res, 429, { error: 'Too many requests' }); return true; }

  if (method === 'OPTIONS') { setCors(req, res); res.writeHead(204); res.end(); return true; }

  if (url === '/admin' || url === '/admin/') {
    try {
      const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      const fallbacks = [
        DASHBOARD_HTML_FALLBACK,
        path.join(process.cwd(), 'artifacts/telegram-bot/src/admin/dashboard.html'),
        path.join(process.cwd(), 'src/admin/dashboard.html'),
      ];
      for (const fp of fallbacks) {
        if (!fs.existsSync(fp)) continue;
        try { const html = fs.readFileSync(fp, 'utf8'); res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return true; } catch { /* try next */ }
      }
      res.writeHead(500); res.end('Dashboard not found');
    }
    return true;
  }

  if (!url.startsWith('/admin/api/')) return false;

  // ===== تشخيص (بدون مصادقة) =====
  if (url === '/admin/api/ping' && method === 'GET') {
    const pw = getAdminPassword();
    const auth = String(req.headers['authorization'] ?? '');
    const provided = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    json(req, res, 200, {
      ok: true,
      passwordSet: !!pw,
      passwordLength: pw?.length ?? 0,
      providedLength: provided.length,
      match: pw ? safeCompare(provided, pw) : false,
      nodeEnv: process.env.NODE_ENV ?? 'undefined',
    });
    return true;
  }

  if (!isAuthorized(req)) { json(req, res, 401, { error: 'غير مصرح' }); return true; }

  const apiPath = url.replace('/admin/api', '');

  try {
    // ===== الإحصائيات الرئيسية =====
    if (apiPath === '/stats' && method === 'GET') {
      const [total, today, active, channels, activeCampaigns, totalCampaigns, tasks, totalPoints] = await Promise.all([
        getUsersCount(), getTodayUsersCount(), getActiveUsersCount(),
        getChannelsCount(), getCampaignsCount(), getTotalCampaignsCount(),
        getTasksCount(), getTotalPointsCirculated(),
      ]);
      json(req, res, 200, { total, today, active, channels, activeCampaigns, totalCampaigns, tasks, totalPoints });
      return true;
    }

    // ===== بيانات الرسم البياني =====
    if (apiPath === '/stats/chart' && method === 'GET') {
      const days = parseInt(getQP(req, 'days', '7'), 10) || 7;
      const data = await getChartData(Math.min(days, 30));
      json(req, res, 200, data);
      return true;
    }

    // ===== المتصدرون =====
    if (apiPath === '/stats/leaderboard' && method === 'GET') {
      const [topPoints, topReferrers] = await Promise.all([getTopUsers(10), getTopReferrers(10)]);
      json(req, res, 200, { topPoints, topReferrers });
      return true;
    }

    // ===== آخر النشاطات =====
    if (apiPath === '/activity' && method === 'GET') {
      const activity = await getRecentActivity(30);
      json(req, res, 200, activity);
      return true;
    }

    // ===== المستخدمون =====
    if (apiPath === '/users' && method === 'GET') {
      const q = getQP(req, 'q');
      const page = Math.max(1, parseInt(getQP(req, 'page', '1'), 10));
      const limit = Math.min(100, parseInt(getQP(req, 'limit', '50'), 10));
      const offset = (page - 1) * limit;
      const [users, total] = await Promise.all([searchUsers(q, limit, offset), searchUsersCount(q)]);
      json(req, res, 200, { users, total, page, limit, pages: Math.ceil(total / limit) });
      return true;
    }

    const userIdMatch = apiPath.match(/^\/users\/(\d+)$/);
    if (userIdMatch && method === 'GET') {
      const userId = parseInt(userIdMatch[1]!, 10);
      const user = await getUserById(userId);
      if (!user) { json(req, res, 404, { error: 'المستخدم غير موجود' }); return true; }
      const [transactions] = await Promise.all([getUserTransactions(userId, 20)]);
      json(req, res, 200, { ...user, transactions });
      return true;
    }

    const userPointsMatch = apiPath.match(/^\/users\/(\d+)\/points$/);
    if (userPointsMatch && method === 'PATCH') {
      const userId = parseInt(userPointsMatch[1]!, 10);
      const body = await readBody(req);
      const points = Number(body['points']);
      if (isNaN(points) || points < 0) { json(req, res, 400, { error: 'قيمة نقاط غير صحيحة' }); return true; }
      await setUserPoints(userId, Math.floor(points));
      json(req, res, 200, { ok: true });
      return true;
    }

    const userBanMatch = apiPath.match(/^\/users\/(\d+)\/ban$/);
    if (userBanMatch && method === 'PATCH') {
      const userId = parseInt(userBanMatch[1]!, 10);
      const body = await readBody(req);
      const ban = Boolean(body['ban']);
      await banUser(userId, ban);
      json(req, res, 200, { ok: true, banned: ban });
      return true;
    }

    const userMsgMatch = apiPath.match(/^\/users\/(\d+)\/message$/);
    if (userMsgMatch && method === 'POST') {
      const userId = parseInt(userMsgMatch[1]!, 10);
      const body = await readBody(req);
      const message = String(body['message'] ?? '').trim();
      if (!message) { json(req, res, 400, { error: 'الرسالة فارغة' }); return true; }
      const user = await getUserById(userId);
      if (!user) { json(req, res, 404, { error: 'المستخدم غير موجود' }); return true; }
      const ok = await sendTelegramMsg(user.telegram_id, message);
      json(req, res, ok ? 200 : 500, { ok });
      return true;
    }

    const userTxMatch = apiPath.match(/^\/users\/(\d+)\/transactions$/);
    if (userTxMatch && method === 'GET') {
      const userId = parseInt(userTxMatch[1]!, 10);
      const transactions = await getUserTransactions(userId, 50);
      json(req, res, 200, transactions);
      return true;
    }

    // ===== تصدير CSV =====
    if (apiPath === '/export/users' && method === 'GET') {
      const users = await exportAllUsers();
      const header = 'id,telegram_id,username,first_name,last_name,points,is_banned,referral_count,referrer_id,created_at';
      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = users.map(u =>
        [u.id, u.telegram_id, u.username, u.first_name, u.last_name, u.points, u.is_banned, u.referral_count, u.referrer_id, u.created_at]
          .map(escape).join(',')
      );
      const csv = [header, ...rows].join('\n');
      setCors(req, res);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="users.csv"',
      });
      res.end('\uFEFF' + csv); // BOM for Excel compatibility
      return true;
    }

    if (apiPath === '/export/transactions' && method === 'GET') {
      const txs = await exportAllTransactions();
      const header = 'id,user_id,type,amount,description,related_id,created_at';
      const escape = (v: unknown) => {
        const s = v == null ? '' : String(v);
        return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const rows = txs.map(t =>
        [t.id, t.user_id, t.type, t.amount, t.description, t.related_id, t.created_at]
          .map(escape).join(',')
      );
      const csv = [header, ...rows].join('\n');
      setCors(req, res);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="transactions.csv"',
      });
      res.end('\uFEFF' + csv); // BOM for Excel compatibility
      return true;
    }

    // ===== معاملات النقاط =====
    if (apiPath === '/transactions' && method === 'GET') {
      const page = Math.max(1, parseInt(getQP(req, 'page', '1'), 10));
      const limit = Math.min(100, parseInt(getQP(req, 'limit', '50'), 10));
      const offset = (page - 1) * limit;
      const [transactions, total] = await Promise.all([getAllTransactions(limit, offset), getTransactionsCount()]);
      json(req, res, 200, { transactions, total, page, limit, pages: Math.ceil(total / limit) });
      return true;
    }

    // ===== التسعير =====
    if (apiPath === '/pricing' && method === 'GET') {
      const [pointsPerMember, tiers] = await Promise.all([getPointsPerMember(), getActivePricingTiers()]);
      json(req, res, 200, { pointsPerMember, tiers });
      return true;
    }

    if (apiPath === '/pricing' && method === 'PUT') {
      const body = await readBody(req);
      const pointsPerMember = Number(body['pointsPerMember']);
      const rawTiers = body['tiers'];
      if (!Number.isInteger(pointsPerMember) || pointsPerMember < 1) { json(req, res, 400, { error: 'قيمة النقاط لكل عضو غير صحيحة' }); return true; }
      if (!Array.isArray(rawTiers) || rawTiers.length === 0 || rawTiers.length > 20) { json(req, res, 400, { error: 'يجب إدخال جدول تسعير واحد على الأقل' }); return true; }
      const seenSubscribers = new Set<number>();
      const tiers = [];
      for (const rawTier of rawTiers) {
        if (!rawTier || typeof rawTier !== 'object') { json(req, res, 400, { error: 'بيانات جدول التسعير غير صحيحة' }); return true; }
        const tier = rawTier as Record<string, unknown>;
        const subscribers = Number(tier['subscribers']);
        const points = Number(tier['points']);
        if (!Number.isInteger(subscribers) || subscribers < 1 || !Number.isInteger(points) || points < 1 || seenSubscribers.has(subscribers)) {
          json(req, res, 400, { error: 'تحقق من أعداد المشتركين والنقاط وتأكد من عدم تكرار الفئات' }); return true;
        }
        seenSubscribers.add(subscribers);
        tiers.push({ subscribers, points, label: `${subscribers} مشتركين — ${points} نقطة` });
      }
      await savePointsPerMember(pointsPerMember);
      await savePricingTiers(tiers);
      json(req, res, 200, { ok: true, pointsPerMember, tiers });
      return true;
    }

    // ===== القنوات/المهام =====
    if (apiPath === '/channels' && method === 'GET') {
      const all = getQP(req, 'all') === '1';
      json(req, res, 200, all ? await getAllChannels() : await getActiveChannels());
      return true;
    }

    if (apiPath === '/channels' && method === 'POST') {
      const body = await readBody(req);
      const username = String(body['username'] ?? '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
      const points = parseInt(String(body['points'] ?? '0'), 10);
      const name = String(body['name'] ?? username).trim() || username;
      if (!username || isNaN(points) || points < 1) { json(req, res, 400, { error: 'أدخل معرّف القناة والنقاط' }); return true; }
      const channel = await createChannel(username, name, points);
      json(req, res, 201, channel);
      return true;
    }

    const channelIdMatch = apiPath.match(/^\/channels\/(\d+)$/);
    if (channelIdMatch) {
      const id = parseInt(channelIdMatch[1]!, 10);
      if (method === 'DELETE') { await deleteChannel(id); json(req, res, 200, { ok: true }); return true; }
      if (method === 'PATCH') {
        const body = await readBody(req);
        if ('points' in body) {
          const points = parseInt(String(body['points'] ?? '0'), 10);
          if (isNaN(points) || points < 1) { json(req, res, 400, { error: 'قيمة نقاط غير صحيحة' }); return true; }
          await updateChannelPoints(id, points);
        }
        if ('active' in body) await toggleChannelActive(id, Boolean(body['active']));
        json(req, res, 200, { ok: true });
        return true;
      }
    }

    const channelToggleMatch = apiPath.match(/^\/channels\/(\d+)\/toggle$/);
    if (channelToggleMatch && method === 'PATCH') {
      const id = parseInt(channelToggleMatch[1]!, 10);
      const body = await readBody(req);
      await toggleChannelActive(id, Boolean(body['active']));
      json(req, res, 200, { ok: true });
      return true;
    }

    const channelStatsMatch = apiPath.match(/^\/channels\/(\d+)\/stats$/);
    if (channelStatsMatch && method === 'GET') {
      const id = parseInt(channelStatsMatch[1]!, 10);
      const count = await getChannelCompletionsCount(id);
      json(req, res, 200, { completions: count });
      return true;
    }

    // ===== الحملات/التمويل =====
    if (apiPath === '/campaigns' && method === 'GET') {
      try {
        const [active, completed] = await Promise.all([getActiveCampaigns(), getCompletedCampaigns()]);
        json(req, res, 200, { active, completed });
      } catch (err) {
        console.error('Error fetching campaigns:', err);
        json(req, res, 500, { error: 'فشل تحميل الحملات' });
      }
      return true;
    }

    if (apiPath === '/campaigns/active' && method === 'GET') { json(req, res, 200, await getActiveCampaigns()); return true; }
    if (apiPath === '/campaigns/completed' && method === 'GET') { json(req, res, 200, await getCompletedCampaigns()); return true; }

    const campaignStopMatch = apiPath.match(/^\/campaigns\/(\d+)\/stop$/);
    if (campaignStopMatch && method === 'POST') {
      await stopCampaign(parseInt(campaignStopMatch[1]!, 10));
      json(req, res, 200, { ok: true });
      return true;
    }

    const campaignDeleteMatch = apiPath.match(/^\/campaigns\/(\d+)$/);
    if (campaignDeleteMatch && method === 'DELETE') {
      await deleteCampaignById(parseInt(campaignDeleteMatch[1]!, 10));
      json(req, res, 200, { ok: true });
      return true;
    }

    // ===== الإذاعة =====
    if (apiPath === '/broadcast' && method === 'POST') {
      const body = await readBody(req);
      const message = String(body['message'] ?? '').trim();
      if (!message) { json(req, res, 400, { error: 'الرسالة فارغة' }); return true; }

      // إرجاع الاستجابة فوراً وإرسال الرسائل في الخلفية
      json(req, res, 202, { ok: true, message: 'جاري الإرسال في الخلفية...' });

      setImmediate(async () => {
        try {
          const users = await getAllUsersForBroadcast();
          let sent = 0, failed = 0;
          for (const user of users) {
            const ok = await sendTelegramMsg(user.telegram_id, message);
            if (ok) sent++; else failed++;
            await new Promise(r => setTimeout(r, 35)); // تأخير لتجنب Rate Limit
          }
          await saveBroadcast(message, sent, failed);
          console.log(`[Broadcast] Sent: ${sent}, Failed: ${failed}`);
        } catch (err) {
          console.error('[Broadcast] Error:', err);
        }
      });
      return true;
    }

    if (apiPath === '/broadcasts' && method === 'GET') {
      json(req, res, 200, await getBroadcasts(20));
      return true;
    }

    // ===== المشرفون =====
    if (apiPath === '/admins' && method === 'GET') {
      json(req, res, 200, await getAdmins());
      return true;
    }

    if (apiPath === '/admins' && method === 'POST') {
      const body = await readBody(req);
      const telegramId = parseInt(String(body['telegram_id'] ?? '0'), 10);
      const username = String(body['username'] ?? '').trim() || null;
      const permissions = String(body['permissions'] ?? 'all').trim() || 'all';
      if (!telegramId || isNaN(telegramId)) { json(req, res, 400, { error: 'أدخل معرّف تيليجرام صحيح' }); return true; }
      const admin = await addAdmin(telegramId, username, permissions);
      json(req, res, 201, admin);
      return true;
    }

    const adminDeleteMatch = apiPath.match(/^\/admins\/(\d+)$/);
    if (adminDeleteMatch && method === 'DELETE') {
      await removeAdmin(parseInt(adminDeleteMatch[1]!, 10));
      json(req, res, 200, { ok: true });
      return true;
    }

    // ===== الإعدادات =====
    if (apiPath === '/settings' && method === 'GET') {
      const settings = await getAllSettings();
      json(req, res, 200, settings);
      return true;
    }

    if (apiPath === '/settings' && method === 'PUT') {
      const body = await readBody(req);
      // أي مفتاح إعداد مسموح به (نتجنب الأحرف الخطرة فقط)
      const SAFE_KEY = /^[a-z_]{1,60}$/;
      for (const [key, val] of Object.entries(body)) {
        if (SAFE_KEY.test(key) && val !== undefined && val !== null) {
          await setSetting(key, String(val));
        }
      }
      json(req, res, 200, { ok: true });
      return true;
    }

    // ===== الهدايا =====
    if (apiPath === '/gifts' && method === 'GET') {
      const gifts = await getGifts();
      json(req, res, 200, gifts);
      return true;
    }

    if (apiPath === '/gifts' && method === 'POST') {
      const body = await readBody(req);
      const points = parseInt(String(body['points'] ?? '0'), 10);
      const maxClaims = parseInt(String(body['max_claims'] ?? '0'), 10);
      const description = String(body['description'] ?? '').trim() || null;
      if (!points || points < 1) { json(req, res, 400, { error: 'أدخل عدد نقاط صحيح' }); return true; }
      if (!maxClaims || maxClaims < 1) { json(req, res, 400, { error: 'أدخل عدد أعضاء صحيح' }); return true; }
      const gift = await createGift(points, maxClaims, description);
      json(req, res, 201, gift);
      return true;
    }

    const giftIdMatch = apiPath.match(/^\/gifts\/(\d+)$/);
    if (giftIdMatch && method === 'DELETE') {
      await deleteGift(parseInt(giftIdMatch[1]!, 10));
      json(req, res, 200, { ok: true });
      return true;
    }

    if (giftIdMatch && method === 'PATCH') {
      await deactivateGift(parseInt(giftIdMatch[1]!, 10));
      json(req, res, 200, { ok: true });
      return true;
    }

    // ===== القنوات الإجبارية =====
    if (apiPath === '/mandatory-channels' && method === 'GET') {
      json(req, res, 200, await getMandatoryChannels());
      return true;
    }

    if (apiPath === '/mandatory-channels' && method === 'POST') {
      const body = await readBody(req);
      const username = String(body['channel_username'] ?? '').trim().replace(/^https?:\/\/t\.me\//, '');
      const chName = String(body['channel_name'] ?? '').trim();
      const maxJoins = body['max_joins'] ? parseInt(String(body['max_joins']), 10) : null;
      if (!username) { json(req, res, 400, { error: 'أدخل معرّف القناة' }); return true; }
      const ch = await addMandatoryChannel(username, chName || username, maxJoins && maxJoins > 0 ? maxJoins : null);
      json(req, res, 201, ch);
      return true;
    }

    const mandatoryIdMatch = apiPath.match(/^\/mandatory-channels\/(\d+)$/);
    if (mandatoryIdMatch) {
      const id = parseInt(mandatoryIdMatch[1]!, 10);
      if (method === 'DELETE') {
        await deleteMandatoryChannel(id);
        json(req, res, 200, { ok: true });
        return true;
      }
      if (method === 'PATCH') {
        const body = await readBody(req);
        if ('is_active' in body) {
          await toggleMandatoryChannel(id, !!body['is_active']);
        } else {
          const chName = String(body['channel_name'] ?? '').trim();
          const maxJoins = body['max_joins'] != null && body['max_joins'] !== '' ? parseInt(String(body['max_joins']), 10) : null;
          await updateMandatoryChannel(id, chName, maxJoins && maxJoins > 0 ? maxJoins : null);
        }
        json(req, res, 200, { ok: true });
        return true;
      }
    }

    json(req, res, 404, { error: 'مسار غير موجود' });
    return true;
  } catch (err) {
    console.error('[Admin API Error]', err);
    json(req, res, 500, { error: 'خطأ داخلي في الخادم' });
    return true;
  }
}
