import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFileSync, existsSync } from 'node:fs';
import { join, extname } from 'node:path';
import { loadState, type GalaxiaState } from '@galaxia/core';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

/**
 * Transform the raw GalaxiaState into the shape the dashboard expects.
 * Includes demo-friendly defaults so the 3D view always renders.
 */
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
      agents: [], // agents come from the orchestrator at runtime
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

export function startDashboard(port = 3333, staticDir?: string, dataDir?: string): void {
  const dir = staticDir ?? join(import.meta.dirname, '..', 'public');
  const sseClients: Set<ServerResponse> = new Set();

  // Push state to all connected SSE clients every 5 seconds
  const pushInterval = setInterval(() => {
    if (sseClients.size === 0) return;
    try {
      const state = loadState(dataDir);
      const payload = buildDashboardPayload(state);
      const data = `data: ${JSON.stringify(payload)}\n\n`;
      for (const res of sseClients) {
        try {
          res.write(data);
        } catch {
          sseClients.delete(res);
        }
      }
    } catch (err) {
      console.error('[dashboard] SSE push error:', (err as Error).message);
    }
  }, 5000);

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const rawUrl = req.url ?? '/';
    const urlPath = rawUrl.split('?')[0];

    // ── GET /api/status ──
    if (urlPath === '/api/status' && req.method === 'GET') {
      try {
        const state = loadState(dataDir);
        const payload = buildDashboardPayload(state);
        const body = JSON.stringify(payload);
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(body);
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    // ── GET /events (SSE) ──
    if (urlPath === '/events' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*',
      });

      // Send initial state immediately
      try {
        const state = loadState(dataDir);
        const payload = buildDashboardPayload(state);
        res.write(`data: ${JSON.stringify(payload)}\n\n`);
      } catch { /* initial push failed, client will get next push */ }

      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // ── GET /health ──
    if (urlPath === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', clients: sseClients.size }));
      return;
    }

    // ── Static files ──
    const filePath = join(dir, urlPath === '/' ? '/index.html' : urlPath);

    // Prevent path traversal
    if (!filePath.startsWith(dir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain' });
      res.end('Forbidden');
      return;
    }

    if (!existsSync(filePath)) {
      // SPA fallback: serve index.html for non-file paths
      const indexPath = join(dir, 'index.html');
      if (existsSync(indexPath) && !extname(urlPath)) {
        try {
          const content = readFileSync(indexPath);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(content);
        } catch {
          res.writeHead(500, { 'Content-Type': 'text/plain' });
          res.end('Internal server error');
        }
        return;
      }
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found');
      return;
    }

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
    console.log(`[galaxia] 3D Command Center running at http://localhost:${port}`);
    console.log(`[galaxia]   Dashboard: http://localhost:${port}/`);
    console.log(`[galaxia]   API:       http://localhost:${port}/api/status`);
    console.log(`[galaxia]   SSE:       http://localhost:${port}/events`);
  });
}
