// GALAXIA Dashboard — Phase 12 refactor.
//
// HTTP server that serves:
//   - `/login`               : login page (HTML)
//   - `/`                    : observability landing (requires auth)
//   - `/api/login` (POST)    : creates a session from {userName, password}
//   - `/api/logout` (POST)   : destroys the session
//   - `/api/me`              : who am I (no auth required)
//   - `/api/state`           : filtered state
//   - `/api/projects`        : user's projects + runtime
//   - `/api/audit?n=…`       : routing audit entries
//   - `/api/missions`        : missions
//   - `/api/users`           : all users (owner only)
//   - `/api/status`          : legacy 3D dashboard payload (kept for back-compat)
//   - `/events`              : SSE push (legacy 3D)
//   - Static assets under public/
//
// Auth: cookie `gx_session` (httpOnly, 24h TTL). Passwords hashed via
// scrypt (Phase 7). Session store is in-memory — reset on daemon restart.

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { loadState, type GalaxiaConfig, type GalaxiaState } from '@galaxia/core';
import {
  createSession, destroySession, lookupSession,
  parseCookie, tryLogin, startSessionSweeper,
} from './auth.js';
import {
  handleGetState, handleGetProjects, handleGetAudit,
  handleGetMissions, handleGetUsers, handleGetMe, handleGetBrain,
  writeJSON, type RouteContext,
} from './routes.js';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const SESSION_COOKIE = 'gx_session';

function buildDashboardPayload(state: GalaxiaState) {
  const projects: Record<string, unknown> = {};
  for (const [id, proj] of Object.entries(state.projects)) {
    projects[id] = {
      name: id,
      status: proj.status ?? 'unknown',
      lastCycle: proj.lastCycle ?? '--',
      backlogCount: proj.backlogCount ?? 0,
      bugFixedToday: proj.bugFixedToday ?? 0,
      nextPriority: proj.nextPriority ?? '',
      agents: [],
    };
  }
  return {
    system: state.system,
    projects,
    lastUpdated: state.lastUpdated,
    dailyStats: state.dailyStats,
    notifications: [] as string[],
  };
}

async function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk: Buffer) => { data += chunk.toString('utf-8'); });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function serveStatic(urlPath: string, dir: string, res: ServerResponse): boolean {
  const filePath = join(dir, urlPath === '/' ? '/index.html' : urlPath);
  if (!filePath.startsWith(dir)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('Forbidden');
    return true;
  }
  if (!existsSync(filePath)) return false;
  const ext = extname(filePath);
  const mime = MIME_TYPES[ext] ?? 'application/octet-stream';
  try {
    const content = readFileSync(filePath);
    res.writeHead(200, {
      'Content-Type': mime,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=3600',
    });
    res.end(content);
  } catch {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal server error');
  }
  return true;
}

export interface StartDashboardOptions {
  port?: number;
  staticDir?: string;
  dataDir?: string;
  config?: GalaxiaConfig;    // when provided, auth + scope features are active
}

export function startDashboard(options: StartDashboardOptions | number = {}, legacyStaticDir?: string, legacyDataDir?: string): void {
  // Back-compat: `startDashboard(port, staticDir?, dataDir?)` was the old signature.
  const opts: StartDashboardOptions = typeof options === 'number'
    ? { port: options, staticDir: legacyStaticDir, dataDir: legacyDataDir }
    : options;
  const port = opts.port ?? 3333;
  const dir = opts.staticDir ?? join(import.meta.dirname, '..', 'public');
  const dataDir = opts.dataDir ?? opts.config?.dataDir;
  const config = opts.config;
  const sseClients: Set<ServerResponse> = new Set();

  startSessionSweeper();

  // SSE push for legacy 3D dashboard (every 5 s).
  const pushInterval = setInterval(() => {
    if (sseClients.size === 0) return;
    try {
      const state = loadState(dataDir);
      const payload = buildDashboardPayload(state);
      const data = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of sseClients) {
        try { res.write(data); } catch { sseClients.delete(res); }
      }
    } catch (err) {
      console.error('[dashboard] SSE push error:', (err as Error).message);
    }
  }, 5000);

  const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url ?? '/';
    const urlPath = rawUrl.split('?')[0] ?? '/';
    const cookieHeader = req.headers.cookie;
    const sessionToken = parseCookie(cookieHeader, SESSION_COOKIE);
    const user = config ? lookupSession(sessionToken, config) : null;
    const ctx: RouteContext | null = config ? { config, user } : null;

    // ── Auth endpoints ──
    if (urlPath === '/api/login' && req.method === 'POST' && ctx) {
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as { userName?: string; password?: string };
        if (!body.userName || !body.password) {
          writeJSON(res, 400, { error: 'userName and password required' });
          return;
        }
        const u = tryLogin(body.userName, body.password, ctx.config);
        if (!u) {
          writeJSON(res, 401, { error: 'invalid credentials' });
          return;
        }
        const s = createSession(u.name);
        res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${s.token}; HttpOnly; Path=/; Max-Age=${24 * 3600}; SameSite=Lax`);
        writeJSON(res, 200, { ok: true, user: { name: u.name, role: u.role, scope: u.scope } });
      } catch (err) {
        writeJSON(res, 400, { error: `bad request: ${(err as Error).message}` });
      }
      return;
    }
    if (urlPath === '/api/logout' && req.method === 'POST' && ctx) {
      if (sessionToken) destroySession(sessionToken);
      res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; HttpOnly; Path=/; Max-Age=0; SameSite=Lax`);
      writeJSON(res, 200, { ok: true });
      return;
    }

    // ── Observability APIs (Phase 12) ──
    if (ctx) {
      if (urlPath === '/api/me'        && req.method === 'GET')  { handleGetMe(req, res, ctx); return; }
      if (urlPath === '/api/state'     && req.method === 'GET')  { handleGetState(req, res, ctx); return; }
      if (urlPath === '/api/projects'  && req.method === 'GET')  { handleGetProjects(req, res, ctx); return; }
      if (urlPath === '/api/audit'     && req.method === 'GET')  { handleGetAudit(req, res, ctx); return; }
      if (urlPath === '/api/missions'  && req.method === 'GET')  { handleGetMissions(req, res, ctx); return; }
      if (urlPath === '/api/users'     && req.method === 'GET')  { handleGetUsers(req, res, ctx); return; }
      if (urlPath === '/api/brain'     && req.method === 'GET')  { handleGetBrain(req, res, ctx); return; }
    }

    // ── Legacy 3D dashboard ──
    if (urlPath === '/api/status' && req.method === 'GET') {
      try {
        const state = loadState(dataDir);
        const payload = buildDashboardPayload(state);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(JSON.stringify(payload));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }
    if (urlPath === '/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });
      try {
        const state = loadState(dataDir);
        res.write(`data: ${JSON.stringify(buildDashboardPayload(state))}\n\n`);
      } catch { /* ignore */ }
      sseClients.add(res);
      req.on('close', () => { sseClients.delete(res); });
      return;
    }
    if (urlPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', sessions: user ? 1 : 0, sseClients: sseClients.size }));
      return;
    }

    // ── Static ──
    // If config is wired, protect the root observability page behind a
    // session: unauthenticated → 302 /login.html. The 3D legacy page
    // (served under /3d.html) stays open for now.
    if (ctx && urlPath === '/' && !user) {
      res.writeHead(302, { 'Location': 'login.html' });
      res.end();
      return;
    }
    if (serveStatic(urlPath, dir, res)) return;

    // SPA fallback.
    const indexPath = join(dir, 'index.html');
    if (!extname(urlPath) && existsSync(indexPath)) {
      if (ctx && !user) {
        res.writeHead(302, { 'Location': 'login.html' });
        res.end();
        return;
      }
      const content = readFileSync(indexPath);
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(content);
      return;
    }
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  });

  server.on('close', () => {
    clearInterval(pushInterval);
    for (const res of sseClients) {
      try { res.end(); } catch { /* ignore */ }
    }
    sseClients.clear();
  });

  const shutdown = () => { server.close(() => process.exit(0)); };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);

  server.listen(port, () => {
    console.log(`[galaxia] Dashboard running at http://localhost:${port}`);
    console.log(`[galaxia]   Login:         /login.html`);
    console.log(`[galaxia]   Observability: /  (auth required)`);
    console.log(`[galaxia]   API:           /api/{me,state,projects,audit,missions,users}`);
    console.log(`[galaxia]   Legacy 3D:     /3d.html`);
  });
}
