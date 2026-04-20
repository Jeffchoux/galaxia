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
import { readFileSync, existsSync, watch, statSync, readdirSync } from 'node:fs';
import { join, extname, basename, dirname } from 'node:path';
import { loadState, type GalaxiaConfig, type GalaxiaState } from '@galaxia/core';
import {
  createSession, destroySession, lookupSession,
  parseCookie, tryLogin, startSessionSweeper,
} from './auth.js';
import {
  handleGetState, handleGetProjects, handleGetAudit,
  handleGetMissions, handleGetUsers, handleGetMe, handleGetBrain,
  handlePostChat, handleGetChatHistory, handlePostChatUpload,
  handleGetWatcherFeed, handlePostWatcherIngest,
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

  // ── Brain-events SSE — live feed of GM dispatches + Jarvis signals ──
  // Clients (dashboard brain viz) subscribe to /api/brain-events. The
  // daemon tails every gm-journal.jsonl for new lines and broadcasts.
  // Jarvis POSTs to /api/brain-events/emit (127.0.0.1 only) to flash
  // the brain when recording starts and when an answer is ready.
  const brainEventClients: Set<ServerResponse> = new Set();
  const broadcastBrainEvent = (event: Record<string, unknown>): void => {
    if (brainEventClients.size === 0) return;
    const data = `data: ${JSON.stringify(event)}\n\n`;
    for (const r of brainEventClients) {
      try { r.write(data); } catch { brainEventClients.delete(r); }
    }
  };
  const memoryRoot = dataDir ? join(dataDir, 'memory', 'projects') : null;
  const journalOffsets: Record<string, number> = {};
  const tailJournal = (file: string, project: string): void => {
    try {
      const st = statSync(file);
      const prev = journalOffsets[file] ?? st.size;
      if (st.size < prev) { journalOffsets[file] = st.size; return; }  // truncated
      if (st.size === prev) return;
      const fd = readFileSync(file);
      const chunk = fd.toString('utf-8', prev, st.size);
      journalOffsets[file] = st.size;
      for (const line of chunk.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
          const j = JSON.parse(trimmed) as Record<string, unknown>;
          broadcastBrainEvent({ source: 'gm', project, ...j });
        } catch { /* skip malformed line */ }
      }
    } catch { /* file missing; ignore */ }
  };
  if (memoryRoot && existsSync(memoryRoot)) {
    try {
      for (const entry of readdirSync(memoryRoot)) {
        const file = join(memoryRoot, entry, 'gm-journal.jsonl');
        if (!existsSync(file)) continue;
        journalOffsets[file] = statSync(file).size;  // start from EOF
        try {
          watch(file, { persistent: false }, () => tailJournal(file, entry));
        } catch (err) {
          console.error(`[brain-events] watch failed on ${file}:`, (err as Error).message);
        }
      }
    } catch (err) {
      console.error('[brain-events] init error:', (err as Error).message);
    }
  }

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
      if (urlPath === '/api/brain'         && req.method === 'GET')  { handleGetBrain(req, res, ctx); return; }
      if (urlPath === '/api/chat'          && req.method === 'POST') { await handlePostChat(req, res, ctx); return; }
      if (urlPath === '/api/chat/history'  && req.method === 'GET')  { handleGetChatHistory(req, res, ctx); return; }
      if (urlPath === '/api/chat/upload'    && req.method === 'POST') { await handlePostChatUpload(req, res, ctx); return; }
      if (urlPath === '/api/watch'          && req.method === 'GET')  { handleGetWatcherFeed(req, res, ctx); return; }
      if (urlPath === '/api/watch'          && req.method === 'POST') { await handlePostWatcherIngest(req, res, ctx); return; }
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
    // ── Brain-events SSE stream (observable cerveau) ──
    if (urlPath === '/api/brain-events' && req.method === 'GET' && ctx) {
      if (!user) { writeJSON(res, 401, { error: 'unauthorized' }); return; }
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ source: 'hello', ts: new Date().toISOString() })}\n\n`);
      brainEventClients.add(res);
      req.on('close', () => { brainEventClients.delete(res); });
      return;
    }

    // ── Brain-events emit (local-only, used by Jarvis) ──
    // Accepts JSON bodies like {event:'jarvis:listening'} or
    // {event:'jarvis:speaking', text:'…'}. 127.0.0.1 check only —
    // Jarvis runs on the same box, nginx sets X-Real-IP.
    if (urlPath === '/api/brain-events/emit' && req.method === 'POST') {
      const fwd = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim();
      const remoteIp = fwd ?? req.socket.remoteAddress ?? '';
      const isLocal = remoteIp === '127.0.0.1' || remoteIp === '::1' || remoteIp === '::ffff:127.0.0.1';
      if (!isLocal) { writeJSON(res, 403, { error: 'local-only' }); return; }
      try {
        const raw = await readBody(req);
        const body = JSON.parse(raw) as Record<string, unknown>;
        broadcastBrainEvent({ source: 'jarvis', ts: new Date().toISOString(), ...body });
        writeJSON(res, 200, { ok: true });
      } catch (err) {
        writeJSON(res, 400, { error: (err as Error).message });
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
    for (const res of brainEventClients) {
      try { res.end(); } catch { /* ignore */ }
    }
    brainEventClients.clear();
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
