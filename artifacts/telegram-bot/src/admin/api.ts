import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  getUsersCount,
  getChannelsCount,
  getCampaignsCount,
  getTasksCount,
  getTotalPointsCirculated,
  getActiveChannels,
  createChannel,
  deleteChannel,
  updateChannelPoints,
  getActiveCampaigns,
  getCompletedCampaigns,
  stopCampaign,
  deleteCampaignById,
  getAllUsers,
  setUserPoints,
} from '../db/queries.js';
import {
  // getCampaignSubscriptionPoints,
  getActivePricingTiers,
  // saveCampaignSubscriptionPoints,
  savePricingTiers,
  getPointsPerMember,
  savePointsPerMember,
} from '../config/pricing.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = path.join(__dirname, 'dashboard.html');
const DASHBOARD_HTML_FALLBACK = path.join(__dirname, '../src/admin/dashboard.html');

// Only use a default password in development or non-production environments.
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? (process.env.NODE_ENV === 'production' ? undefined : 'admin');
const ALLOWED_ADMIN_ORIGINS = process.env.ADMIN_ALLOWED_ORIGINS
  ? process.env.ADMIN_ALLOWED_ORIGINS.split(',').map((item) => item.trim()).filter(Boolean)
  : [];
const MAX_BODY_SIZE = 1024 * 1024; // 1 MiB
const ADMIN_RATE_LIMIT_WINDOW_MS = 60_000; // 1 minute
const ADMIN_RATE_LIMIT_MAX_REQUESTS = 30;
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

  if (existing.count >= ADMIN_RATE_LIMIT_MAX_REQUESTS) {
    return true;
  }

  existing.count += 1;
  return false;
}

function setCors(req: IncomingMessage, res: ServerResponse): void {
  const origin = String(req.headers.origin ?? '');
  if (ALLOWED_ADMIN_ORIGINS.length > 0 && ALLOWED_ADMIN_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function safeCompare(a: string, b: string): boolean {
  const aBuf = Buffer.from(a, 'utf8');
  const bBuf = Buffer.from(b, 'utf8');
  if (aBuf.length !== bBuf.length) return false;
  return timingSafeEqual(aBuf, bBuf);
}

function isAuthorized(req: IncomingMessage): boolean {
  if (!ADMIN_PASSWORD) {
    return false;
  }

  const auth = String(req.headers['authorization'] ?? '');

  if (process.env.DEBUG_ADMIN_AUTH === 'true') {
    console.log('[DEBUG] admin authorization header:', auth);
  }

  if (auth.startsWith('Bearer ')) return safeCompare(auth.slice(7), ADMIN_PASSWORD);
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [, pwd] = decoded.split(':');
    return safeCompare(pwd ?? '', ADMIN_PASSWORD);
  }
  return false;
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const contentLength = Number(req.headers['content-length'] ?? '0');
  if (contentLength > MAX_BODY_SIZE) {
    req.destroy();
    return {};
  }

  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => {
      data += chunk.toString();
      if (data.length > MAX_BODY_SIZE) {
        req.destroy();
        resolve({});
      }
    });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function json(req: IncomingMessage, res: ServerResponse, status: number, body: unknown): void {
  setCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function handleAdminRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (isRateLimited(req)) {
    json(req, res, 429, { error: 'Too many requests' });
    return true;
  }

  if (method === 'OPTIONS') {
    setCors(req, res);
    res.writeHead(204);
    res.end();
    return true;
  }

  if (url === '/admin' || url === '/admin/') {
    try {
      const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch (err) {
      console.error('Failed to read dashboard.html:', err);
      const fallbackPaths = [
        DASHBOARD_HTML_FALLBACK,
        path.join(process.cwd(), 'artifacts/telegram-bot/src/admin/dashboard.html'),
        path.join(process.cwd(), 'src/admin/dashboard.html'),
      ];
      for (const fallbackPath of fallbackPaths) {
        if (!fs.existsSync(fallbackPath)) continue;
        try {
          const html = fs.readFileSync(fallbackPath, 'utf8');
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(html);
          return true;
        } catch (fallbackErr) {
          console.error('Failed to read fallback dashboard.html:', fallbackErr);
        }
      }
      res.writeHead(500);
      res.end('Dashboard not found');
    }
    return true;
  }

  if (!url.startsWith('/admin/api/')) return false;

  if (!isAuthorized(req)) {
    json(req, res, 401, { error: 'ط؛ظٹط± ظ…طµط±ط­' });
    return true;
  }

  const apiPath = url.replace('/admin/api', '');

  // ===== ط¥ط­طµط§ط¦ظٹط§طھ =====
  if (apiPath === '/stats' && method === 'GET') {
    const [users, channels, campaigns, tasks, totalPoints] = await Promise.all([
      getUsersCount(),
      getChannelsCount(),
      getCampaignsCount(),
      getTasksCount(),
      getTotalPointsCirculated(),
    ]);
    json(req, res, 200, { users, channels, campaigns, tasks, totalPoints });
    return true;
  }

  // ===== ط§ظ„ظ…ط³طھط®ط¯ظ…ظˆظ† =====
  if (apiPath === '/users' && method === 'GET') {
    json(req, res, 200, await getAllUsers(200));
    return true;
  }

  // ===== ط§ظ„طھط³ط¹ظٹط± =====
  if (apiPath === '/pricing' && method === 'GET') {
    const [pointsPerMember, tiers] = await Promise.all([
      getPointsPerMember(),
      getActivePricingTiers(),
    ]);
    json(req, res, 200, { pointsPerMember, tiers });
    return true;
  }

  if (apiPath === '/pricing' && method === 'PUT') {
    const body = await readBody(req);
    const pointsPerMember = Number(body['pointsPerMember']);
    const rawTiers = body['tiers'];

    if (!Number.isInteger(pointsPerMember) || pointsPerMember < 1) {
      json(req, res, 400, { error: 'ظ‚ظٹظ…ط© ظ†ظ‚ط§ط· ظ„ظƒظ„ ط¹ط¶ظˆ ط؛ظٹط± طµط­ظٹط­ط©' });
      return true;
    }

    if (!Array.isArray(rawTiers) || rawTiers.length === 0 || rawTiers.length > 20) {
      json(req, res, 400, { error: 'ظٹط¬ط¨ ط¥ط¯ط®ط§ظ„ ط¬ط¯ظˆظ„ طھط³ط¹ظٹط± ظˆط§ط­ط¯ ط¹ظ„ظ‰ ط§ظ„ط£ظ‚ظ„' });
      return true;
    }

    const seenSubscribers = new Set<number>();
    const tiers = [];
    for (const rawTier of rawTiers) {
      if (!rawTier || typeof rawTier !== 'object') {
        json(req, res, 400, { error: 'ط¨ظٹط§ظ†ط§طھ ط¬ط¯ظˆظ„ ط§ظ„طھط³ط¹ظٹط± ط؛ظٹط± طµط­ظٹط­ط©' });
        return true;
      }

      const tier = rawTier as Record<string, unknown>;
      const subscribers = Number(tier['subscribers']);
      const points = Number(tier['points']);
      if (
        !Number.isInteger(subscribers) ||
        subscribers < 1 ||
        !Number.isInteger(points) ||
        points < 1 ||
        seenSubscribers.has(subscribers)
      ) {
        json(req, res, 400, { error: 'طھط­ظ‚ظ‚ ظ…ظ† ط£ط¹ط¯ط§ط¯ ط§ظ„ظ…ط´طھط±ظƒظٹظ† ظˆط§ظ„ظ†ظ‚ط§ط· ظˆطھط£ظƒط¯ ظ…ظ† ط¹ط¯ظ… طھظƒط±ط§ط± ط§ظ„ظپط¦ط§طھ' });
        return true;
      }

      seenSubscribers.add(subscribers);
      tiers.push({
        subscribers,
        points,
        label: `${subscribers} ظ…ط´طھط±ظƒظٹظ† â€” ${points} ظ†ظ‚ط·ط©`,
      });
    }

    await savePointsPerMember(pointsPerMember);
    await savePricingTiers(tiers);
    json(req, res, 200, { ok: true, pointsPerMember, tiers });
    return true;
  }

  const userPointsMatch = apiPath.match(/^\/users\/(\d+)\/points$/);
  if (userPointsMatch && method === 'PATCH') {
    const userId = parseInt(userPointsMatch[1]!, 10);
    const body = await readBody(req);
    const points = Number(body['points']);
    if (isNaN(points) || points < 0) { json(req, res, 400, { error: 'ظ‚ظٹظ…ط© ظ†ظ‚ط§ط· ط؛ظٹط± طµط­ظٹط­ط©' }); return true; }
    await setUserPoints(userId, points);
    json(req, res, 200, { ok: true });
    return true;
  }

  // ===== ط§ظ„ظ‚ظ†ظˆط§طھ =====
  if (apiPath === '/channels' && method === 'GET') {
    json(req, res, 200, await getActiveChannels());
    return true;
  }

  if (apiPath === '/channels' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body['username'] ?? '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
    const points = parseInt(String(body['points'] ?? '0'), 10);
    if (!username || isNaN(points) || points < 1) {
      json(req, res, 400, { error: 'ط£ط¯ط®ظ„ ظ…ط¹ط±ظ‘ظپ ط§ظ„ظ‚ظ†ط§ط© ظˆط§ظ„ظ†ظ‚ط§ط·' });
      return true;
    }
    const channel = await createChannel(username, username, points);
    json(req, res, 201, channel);
    return true;
  }

  const channelIdMatch = apiPath.match(/^\/channels\/(\d+)$/);
  if (channelIdMatch) {
    const id = parseInt(channelIdMatch[1]!, 10);
    if (method === 'DELETE') {
      await deleteChannel(id);
      json(req, res, 200, { ok: true });
      return true;
    }
    if (method === 'PATCH') {
      const body = await readBody(req);
      const points = parseInt(String(body['points'] ?? '0'), 10);
      if (isNaN(points) || points < 1) { json(req, res, 400, { error: 'ظ‚ظٹظ…ط© ظ†ظ‚ط§ط· ط؛ظٹط± طµط­ظٹط­ط©' }); return true; }
      await updateChannelPoints(id, points);
      json(req, res, 200, { ok: true });
      return true;
    }
  }

  // ===== ط­ظ…ظ„ط§طھ (طµط§ظ„ط­ ظ„ظ„ظˆط§ط¬ظ‡ط© ط§ظ„ظ‚ط¯ظٹظ…ط© ظˆط§ظ„ط¬ط¯ظٹط¯ط©) =====
  if (apiPath === '/campaigns' && method === 'GET') {
    try {
      const [active, completed] = await Promise.all([
        getActiveCampaigns(),
        getCompletedCampaigns(),
      ]);
      json(req, res, 200, { active, completed });
    } catch (err) {
      console.error('Error fetching campaigns:', err);
      json(req, res, 500, { error: 'ظپط´ظ„ طھط­ظ…ظٹظ„ ط§ظ„ط­ظ…ظ„ط§طھ' });
    }
    return true;
  }

  // ===== ط§ظ„ط­ظ…ظ„ط§طھ (ظ…ط³ط§ط±ط§طھ ظ…ظپطµظ‘ظ„ط©) =====
  if (apiPath === '/campaigns/active' && method === 'GET') {
    json(req, res, 200, await getActiveCampaigns());
    return true;
  }

  if (apiPath === '/campaigns/completed' && method === 'GET') {
    json(req, res, 200, await getCompletedCampaigns());
    return true;
  }

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

  json(req, res, 404, { error: 'ظ…ط³ط§ط± ط؛ظٹط± ظ…ظˆط¬ظˆط¯' });
  return true;
}


