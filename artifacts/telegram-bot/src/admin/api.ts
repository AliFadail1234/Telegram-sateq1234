import type { IncomingMessage, ServerResponse } from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DASHBOARD_HTML = path.join(__dirname, 'dashboard.html');
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? 'admin123';

// ===== مساعد CORS =====
function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ===== التحقق من الصلاحية =====
function isAuthorized(req: IncomingMessage): boolean {
  const auth = req.headers['authorization'] ?? '';
  // Bearer token
  if (auth.startsWith('Bearer ')) {
    return auth.slice(7) === ADMIN_PASSWORD;
  }
  // Basic auth
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [, pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  }
  return false;
}

// ===== قراءة body الطلب =====
async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString(); });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); }
      catch { resolve({}); }
    });
  });
}

// ===== إرسال JSON =====
function json(res: ServerResponse, status: number, body: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

// ===== معالج طلبات الـ Admin =====
export async function handleAdminRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  // OPTIONS preflight
  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return true;
  }

  // صفحة لوحة التحكم
  if (url === '/admin' || url === '/admin/') {
    try {
      const html = fs.readFileSync(DASHBOARD_HTML, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
    } catch {
      res.writeHead(500);
      res.end('Dashboard not found');
    }
    return true;
  }

  // كل مسارات الـ API
  if (!url.startsWith('/admin/api/')) return false;

  // تحقق من الصلاحية للـ API
  if (!isAuthorized(req)) {
    json(res, 401, { error: 'غير مصرح' });
    return true;
  }

  const apiPath = url.replace('/admin/api', '');

  // ===== إحصائيات =====
  if (apiPath === '/stats' && method === 'GET') {
    json(res, 200, {
      users: getUsersCount(),
      channels: getChannelsCount(),
      campaigns: getCampaignsCount(),
      tasks: getTasksCount(),
      totalPoints: getTotalPointsCirculated(),
    });
    return true;
  }

  // ===== المستخدمون =====
  if (apiPath === '/users' && method === 'GET') {
    json(res, 200, getAllUsers(200));
    return true;
  }

  // تعديل نقاط مستخدم
  const userPointsMatch = apiPath.match(/^\/users\/(\d+)\/points$/);
  if (userPointsMatch && method === 'PATCH') {
    const userId = parseInt(userPointsMatch[1]!, 10);
    const body = await readBody(req);
    const points = Number(body['points']);
    if (isNaN(points) || points < 0) { json(res, 400, { error: 'قيمة نقاط غير صحيحة' }); return true; }
    setUserPoints(userId, points);
    json(res, 200, { ok: true });
    return true;
  }

  // ===== القنوات =====
  if (apiPath === '/channels' && method === 'GET') {
    json(res, 200, getActiveChannels());
    return true;
  }

  if (apiPath === '/channels' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body['username'] ?? '').replace(/^@/, '').trim();
    const name = String(body['name'] ?? '').trim();
    const points = parseInt(String(body['points'] ?? '0'), 10);
    if (!username || !name || isNaN(points) || points < 1) {
      json(res, 400, { error: 'بيانات القناة غير مكتملة' });
      return true;
    }
    const channel = createChannel(username, name, points);
    json(res, 201, channel);
    return true;
  }

  const channelIdMatch = apiPath.match(/^\/channels\/(\d+)$/);
  if (channelIdMatch) {
    const id = parseInt(channelIdMatch[1]!, 10);
    if (method === 'DELETE') {
      deleteChannel(id);
      json(res, 200, { ok: true });
      return true;
    }
    if (method === 'PATCH') {
      const body = await readBody(req);
      const points = parseInt(String(body['points'] ?? '0'), 10);
      if (isNaN(points) || points < 1) { json(res, 400, { error: 'قيمة نقاط غير صحيحة' }); return true; }
      updateChannelPoints(id, points);
      json(res, 200, { ok: true });
      return true;
    }
  }

  // ===== الحملات =====
  if (apiPath === '/campaigns/active' && method === 'GET') {
    json(res, 200, getActiveCampaigns());
    return true;
  }

  if (apiPath === '/campaigns/completed' && method === 'GET') {
    json(res, 200, getCompletedCampaigns());
    return true;
  }

  const campaignStopMatch = apiPath.match(/^\/campaigns\/(\d+)\/stop$/);
  if (campaignStopMatch && method === 'POST') {
    stopCampaign(parseInt(campaignStopMatch[1]!, 10));
    json(res, 200, { ok: true });
    return true;
  }

  const campaignDeleteMatch = apiPath.match(/^\/campaigns\/(\d+)$/);
  if (campaignDeleteMatch && method === 'DELETE') {
    deleteCampaignById(parseInt(campaignDeleteMatch[1]!, 10));
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: 'مسار غير موجود' });
  return true;
}
