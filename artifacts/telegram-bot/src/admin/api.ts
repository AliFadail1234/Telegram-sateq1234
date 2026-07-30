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

function setCors(res: ServerResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function isAuthorized(req: IncomingMessage): boolean {
  const auth = req.headers['authorization'] ?? '';
  if (auth.startsWith('Bearer ')) return auth.slice(7) === ADMIN_PASSWORD;
  if (auth.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const [, pwd] = decoded.split(':');
    return pwd === ADMIN_PASSWORD;
  }
  return false;
}

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

function json(res: ServerResponse, status: number, body: unknown): void {
  setCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

export async function handleAdminRequest(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
  const url = req.url ?? '/';
  const method = req.method ?? 'GET';

  if (method === 'OPTIONS') {
    setCors(res);
    res.writeHead(204);
    res.end();
    return true;
  }

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

  if (!url.startsWith('/admin/api/')) return false;

  if (!isAuthorized(req)) {
    json(res, 401, { error: 'غير مصرح' });
    return true;
  }

  const apiPath = url.replace('/admin/api', '');

  // ===== إحصائيات =====
  if (apiPath === '/stats' && method === 'GET') {
    const [users, channels, campaigns, tasks, totalPoints] = await Promise.all([
      getUsersCount(),
      getChannelsCount(),
      getCampaignsCount(),
      getTasksCount(),
      getTotalPointsCirculated(),
    ]);
    json(res, 200, { users, channels, campaigns, tasks, totalPoints });
    return true;
  }

  // ===== المستخدمون =====
  if (apiPath === '/users' && method === 'GET') {
    json(res, 200, await getAllUsers(200));
    return true;
  }

  const userPointsMatch = apiPath.match(/^\/users\/(\d+)\/points$/);
  if (userPointsMatch && method === 'PATCH') {
    const userId = parseInt(userPointsMatch[1]!, 10);
    const body = await readBody(req);
    const points = Number(body['points']);
    if (isNaN(points) || points < 0) { json(res, 400, { error: 'قيمة نقاط غير صحيحة' }); return true; }
    await setUserPoints(userId, points);
    json(res, 200, { ok: true });
    return true;
  }

  // ===== القنوات =====
  if (apiPath === '/channels' && method === 'GET') {
    json(res, 200, await getActiveChannels());
    return true;
  }

  if (apiPath === '/channels' && method === 'POST') {
    const body = await readBody(req);
    const username = String(body['username'] ?? '').replace(/^@/, '').replace(/^https?:\/\/t\.me\//i, '').trim();
    const points = parseInt(String(body['points'] ?? '0'), 10);
    if (!username || isNaN(points) || points < 1) {
      json(res, 400, { error: 'أدخل معرّف القناة والنقاط' });
      return true;
    }
    const channel = await createChannel(username, username, points);
    json(res, 201, channel);
    return true;
  }

  const channelIdMatch = apiPath.match(/^\/channels\/(\d+)$/);
  if (channelIdMatch) {
    const id = parseInt(channelIdMatch[1]!, 10);
    if (method === 'DELETE') {
      await deleteChannel(id);
      json(res, 200, { ok: true });
      return true;
    }
    if (method === 'PATCH') {
      const body = await readBody(req);
      const points = parseInt(String(body['points'] ?? '0'), 10);
      if (isNaN(points) || points < 1) { json(res, 400, { error: 'قيمة نقاط غير صحيحة' }); return true; }
      await updateChannelPoints(id, points);
      json(res, 200, { ok: true });
      return true;
    }
  }

  // ===== الحملات =====
  if (apiPath === '/campaigns/active' && method === 'GET') {
    json(res, 200, await getActiveCampaigns());
    return true;
  }

  if (apiPath === '/campaigns/completed' && method === 'GET') {
    json(res, 200, await getCompletedCampaigns());
    return true;
  }

  const campaignStopMatch = apiPath.match(/^\/campaigns\/(\d+)\/stop$/);
  if (campaignStopMatch && method === 'POST') {
    await stopCampaign(parseInt(campaignStopMatch[1]!, 10));
    json(res, 200, { ok: true });
    return true;
  }

  const campaignDeleteMatch = apiPath.match(/^\/campaigns\/(\d+)$/);
  if (campaignDeleteMatch && method === 'DELETE') {
    await deleteCampaignById(parseInt(campaignDeleteMatch[1]!, 10));
    json(res, 200, { ok: true });
    return true;
  }

  json(res, 404, { error: 'مسار غير موجود' });
  return true;
}
