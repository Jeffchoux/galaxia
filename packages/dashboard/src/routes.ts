// GALAXIA Dashboard — API routes for Phase 12.
//
// Every handler signature: (req, res, ctx) — `ctx` carries the resolved
// user when a session cookie maps to one. Routes that need auth return
// 401 when ctx.user is null. Scope is applied per-route (collaborators
// only see their projects in /api/projects etc.).

import { existsSync, readFileSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GalaxiaConfig, GalaxiaUser } from '@galaxia/core';
import {
  loadState,
  userCanAccess,
  isOwner,
  routingAuditPath,
  missionsFilePath,
} from '@galaxia/core';

export interface RouteContext {
  config: GalaxiaConfig;
  user: GalaxiaUser | null;     // null for unauthenticated requests
}

export function writeJSON(res: ServerResponse, status: number, body: unknown): void {
  const text = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
  });
  res.end(text);
}

function requireAuth(res: ServerResponse, user: GalaxiaUser | null): boolean {
  if (!user) {
    writeJSON(res, 401, { error: 'unauthorized' });
    return false;
  }
  return true;
}

// ── GET /api/state ─────────────────────────────────────────────────────────

export function handleGetState(_req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const state = loadState(ctx.config.dataDir);
  // Filter projects by scope.
  const projects: typeof state.projects = {};
  for (const [name, proj] of Object.entries(state.projects ?? {})) {
    if (userCanAccess(ctx.user!, name)) projects[name] = proj;
  }
  writeJSON(res, 200, { ...state, projects });
}

// ── GET /api/projects ──────────────────────────────────────────────────────

export function handleGetProjects(_req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const configured = (ctx.config.projects ?? []).filter((p) => userCanAccess(ctx.user!, p.name));
  const state = loadState(ctx.config.dataDir);
  const payload = configured.map((p) => ({
    name: p.name,
    path: p.path,
    description: p.description ?? '',
    gm: p.gm ?? { enabled: false },
    runtime: state.projects?.[p.name] ?? null,
  }));
  writeJSON(res, 200, { projects: payload });
}

// ── GET /api/audit?n=50&project=... ────────────────────────────────────────

export function handleGetAudit(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const n = Math.min(500, Math.max(1, Number(url.searchParams.get('n') ?? '50')));
  const projectFilter = url.searchParams.get('project');
  const path = routingAuditPath(ctx.config.dataDir);
  if (!existsSync(path)) {
    writeJSON(res, 200, { entries: [] });
    return;
  }
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(Boolean).slice(-2000);
    const entries: unknown[] = [];
    for (const line of lines) {
      try {
        const entry = JSON.parse(line) as { ctx?: { projectTag?: string } };
        const tag = entry.ctx?.projectTag;
        // Scope: if the entry is tied to a project, the user must have access.
        if (tag && !userCanAccess(ctx.user!, tag)) continue;
        if (projectFilter && tag !== projectFilter) continue;
        entries.push(entry);
      } catch { /* skip malformed */ }
    }
    writeJSON(res, 200, { entries: entries.slice(-n) });
  } catch (err) {
    writeJSON(res, 500, { error: (err as Error).message });
  }
}

// ── GET /api/missions ──────────────────────────────────────────────────────

export function handleGetMissions(_req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const path = missionsFilePath(ctx.config.dataDir);
  if (!existsSync(path)) {
    writeJSON(res, 200, { missions: [] });
    return;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
    writeJSON(res, 200, { missions: Array.isArray(parsed) ? parsed : [] });
  } catch (err) {
    writeJSON(res, 500, { error: (err as Error).message });
  }
}

// ── GET /api/users (owner only) ────────────────────────────────────────────

export function handleGetUsers(_req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  if (!isOwner(ctx.user!)) {
    writeJSON(res, 403, { error: 'owner only' });
    return;
  }
  const payload = (ctx.config.users ?? []).map((u) => ({
    name: u.name,
    role: u.role,
    scope: u.scope,
    telegram: (u.auth?.telegramChatIds ?? []).length > 0,
    web: Boolean(u.auth?.webPasswordHash),
  }));
  writeJSON(res, 200, { owner: ctx.config.owner ?? null, users: payload });
}

// ── GET /api/me ────────────────────────────────────────────────────────────

export function handleGetMe(_req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!ctx.user) {
    writeJSON(res, 200, { authenticated: false });
    return;
  }
  writeJSON(res, 200, {
    authenticated: true,
    user: {
      name: ctx.user.name,
      role: ctx.user.role,
      scope: ctx.user.scope,
    },
  });
}
