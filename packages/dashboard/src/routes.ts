// GALAXIA Dashboard — API routes for Phase 12.
//
// Every handler signature: (req, res, ctx) — `ctx` carries the resolved
// user when a session cookie maps to one. Routes that need auth return
// 401 when ctx.user is null. Scope is applied per-route (collaborators
// only see their projects in /api/projects etc.).

import { existsSync, readFileSync, mkdirSync, appendFileSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { GalaxiaConfig, GalaxiaUser } from '@galaxia/core';
import {
  loadState,
  userCanAccess,
  isOwner,
  routingAuditPath,
  missionsFilePath,
  loadGMState,
  loadWatcherFindings,
  ingestWatcherSubmission,
  callLLM,
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

// ── GET /api/brain ─────────────────────────────────────────────────────────
// Payload for the 3D brain view on the Overview tab: per-project GM state
// and recent actions, so the renderer can draw live connections between
// project nodes and the agents that were recently dispatched for them.

export function handleGetBrain(_req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const projects: Record<string, unknown> = {};
  for (const p of (ctx.config.projects ?? [])) {
    if (!userCanAccess(ctx.user!, p.name)) continue;
    const gms = loadGMState(ctx.config.dataDir, p.name);
    projects[p.name] = {
      gm: {
        enabled:       gms.enabled,
        paused:        gms.paused,
        healthScore:   gms.healthScore,
        cyclesRun:     gms.cyclesRun,
        lastReviewAt:  gms.lastReviewAt ?? null,
      },
      recentActions:    gms.recentActions.slice(-10),
      activeObjectives: gms.currentObjectives.filter((o) => o.status === 'active').length,
    };
  }
  writeJSON(res, 200, { projects });
}

// ── Chat (conversation persistée par user) ────────────────────────────────
// POST /api/chat  { message }
// GET  /api/chat/history?n=200
//
// La conversation est routée via callLLM avec dataClass='personal' +
// taskType='analysis' (même chemin que le freetext Telegram), donc les
// règles de routage existantes s'appliquent. Persistance en JSONL sous
// memory/chat/<userName>.jsonl pour que la conversation survive aux
// restarts et reste isolée par user (scope).

interface ChatAttachment {
  id: string;                   // uuid used in storage filename
  name: string;                 // original filename (sanitized)
  size: number;
  mime: string;
  storedAt: string;             // absolute path under memory/chat-uploads/<user>/
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  text: string;
  ts: string;
  attachments?: ChatAttachment[];
  meta?: {
    provider?: string;
    model?: string;
    transport?: string;
    matchedRule?: string;
    durationMs?: number;
  };
}

function chatPath(dataDir: string, userName: string): string {
  // Slug the user name (paranoid against `../` even though config-controlled).
  const safe = userName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(dataDir, 'memory', 'chat', `${safe}.jsonl`);
}

function loadChatHistory(dataDir: string, userName: string, n: number): ChatMessage[] {
  const p = chatPath(dataDir, userName);
  if (!existsSync(p)) return [];
  try {
    const raw = readFileSync(p, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const out: ChatMessage[] = [];
    for (const line of lines.slice(-Math.max(n, 1))) {
      try { out.push(JSON.parse(line) as ChatMessage); } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

function appendChatMessage(dataDir: string, userName: string, msg: ChatMessage): void {
  const p = chatPath(dataDir, userName);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(msg) + '\n', 'utf-8');
}

// ── Chat attachments (upload + read) ──────────────────────────────────────

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;     // 10 MiB per file
const ATTACH_TEXT_INLINE_MAX = 30 * 1024;      // cap text content fed to the LLM
const ATTACH_COUNT_IN_PROMPT = 3;              // at most N attachments expanded inline per message

function userChatUploadDir(dataDir: string, userName: string): string {
  const safe = userName.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(dataDir, 'memory', 'chat-uploads', safe);
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100) || 'file.bin';
}

function isTextLikeMime(mime: string, filename: string): boolean {
  if (mime.startsWith('text/')) return true;
  if (mime === 'application/json') return true;
  if (mime === 'application/xml') return true;
  if (mime === 'application/yaml' || mime === 'text/yaml') return true;
  if (/\.(md|txt|ts|tsx|js|jsx|json|yaml|yml|html|css|scss|sql|py|rs|go|sh|env\.example|spec)$/.test(filename.toLowerCase())) return true;
  return false;
}

export async function handlePostChatUpload(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
  if (!requireAuth(res, ctx.user)) return;
  const user = ctx.user!;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const name = sanitizeFilename(url.searchParams.get('name') ?? 'upload.bin');
  const mime = (req.headers['content-type'] as string) || 'application/octet-stream';

  // Stream the body with a hard size cap (protects disk + memory).
  const chunks: Buffer[] = [];
  let total = 0;
  try {
    for await (const chunk of req as AsyncIterable<Buffer>) {
      total += chunk.length;
      if (total > MAX_UPLOAD_BYTES) {
        writeJSON(res, 413, { error: 'file too large', maxBytes: MAX_UPLOAD_BYTES });
        return;
      }
      chunks.push(chunk);
    }
  } catch (err) {
    writeJSON(res, 400, { error: `read error: ${(err as Error).message}` });
    return;
  }
  const buf = Buffer.concat(chunks);

  const id = randomUUID();
  const dir = userChatUploadDir(ctx.config.dataDir, user.name);
  mkdirSync(dir, { recursive: true });
  const storedAt = join(dir, `${id}-${name}`);
  writeFileSync(storedAt, buf);

  const attachment: ChatAttachment = { id, name, size: buf.length, mime, storedAt };
  writeJSON(res, 200, { attachment });
}

function readAttachmentSafely(att: ChatAttachment, user: GalaxiaUser, dataDir: string): { content: string | null; truncated: boolean; reason?: string } {
  // Revalidate path: must be inside the user's upload dir. This prevents
  // a malicious client from sending a spoofed `storedAt` pointing at
  // /etc/passwd or another user's files.
  const expectedPrefix = userChatUploadDir(dataDir, user.name) + '/';
  if (!att.storedAt.startsWith(expectedPrefix)) {
    return { content: null, truncated: false, reason: 'path mismatch' };
  }
  if (!existsSync(att.storedAt)) return { content: null, truncated: false, reason: 'not found' };
  if (!isTextLikeMime(att.mime, att.name)) return { content: null, truncated: false, reason: 'binary' };
  try {
    const buf = readFileSync(att.storedAt);
    const truncated = buf.byteLength > ATTACH_TEXT_INLINE_MAX;
    const slice = truncated ? buf.subarray(0, ATTACH_TEXT_INLINE_MAX) : buf;
    return { content: slice.toString('utf-8'), truncated };
  } catch (err) {
    return { content: null, truncated: false, reason: (err as Error).message };
  }
}

function buildAttachmentPromptBlock(attachments: ChatAttachment[], user: GalaxiaUser, dataDir: string): string {
  if (!attachments || attachments.length === 0) return '';
  const lines: string[] = ['', '---', 'Fichiers joints par l\'utilisateur :', ''];
  let expanded = 0;
  for (const att of attachments) {
    const sizeKb = (att.size / 1024).toFixed(1);
    if (expanded >= ATTACH_COUNT_IN_PROMPT) {
      lines.push(`- ${att.name} (${att.mime}, ${sizeKb} KiB) — [non chargé dans la fenêtre de contexte]`);
      continue;
    }
    const read = readAttachmentSafely(att, user, dataDir);
    if (read.content === null) {
      lines.push(`- ${att.name} (${att.mime}, ${sizeKb} KiB) — [${read.reason ?? 'non lisible'}]`);
      continue;
    }
    const suffix = read.truncated ? ` (tronqué à ${ATTACH_TEXT_INLINE_MAX} octets)` : '';
    lines.push(`### ${att.name}${suffix}`);
    lines.push('```');
    lines.push(read.content);
    lines.push('```');
    expanded++;
  }
  return lines.join('\n');
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolveP, reject) => {
    let data = '';
    req.on('data', (c: Buffer) => { data += c.toString('utf-8'); if (data.length > 200_000) reject(new Error('payload too large')); });
    req.on('end', () => resolveP(data));
    req.on('error', reject);
  });
}

const CHAT_SYSTEM = [
  'Tu es Galaxia — l\'IA personnelle de ton propriétaire, tournant en daemon 24/7 sur son VPS.',
  'Tu parles en français (ou en anglais si on s\'adresse à toi en anglais).',
  'Tu connais la structure Galaxia : des pièces (projets) dans /opt/galaxia/projects/, chaque pièce a un General Manager IA, un action runner surface v1 à 8 kinds, un routage par dataClass/taskType.',
  'Tu réponds concis, direct. Pas de préambule ni de flatterie. Quand l\'utilisateur demande une action qui nécessiterait l\'action runner, suggère-lui /plan <agent> "<task>" depuis le dashboard ou Telegram.',
  'Tu n\'as pas encore la capacité d\'exécuter des outils depuis ce canal (v1). Ton rôle ici c\'est : conseiller, analyser, répondre, aider à réfléchir.',
].join(' ');

export async function handlePostChat(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
  if (!requireAuth(res, ctx.user)) return;
  let body: { message?: string; attachments?: ChatAttachment[] };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as { message?: string; attachments?: ChatAttachment[] };
  } catch (err) {
    writeJSON(res, 400, { error: `bad request: ${(err as Error).message}` });
    return;
  }
  const text = (body.message ?? '').trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];
  if (!text && attachments.length === 0) { writeJSON(res, 400, { error: 'empty message' }); return; }
  if (text.length > 10_000) { writeJSON(res, 413, { error: 'message too long (10k max)' }); return; }

  const user = ctx.user!;
  const now = new Date().toISOString();

  // Append the user message immediately so a crash after LLM call still keeps it.
  const userMsg: ChatMessage = { id: randomUUID(), role: 'user', text, ts: now, attachments: attachments.length ? attachments : undefined };
  appendChatMessage(ctx.config.dataDir, user.name, userMsg);

  // Build a light conversation window — last 20 messages prepended to the prompt.
  const history = loadChatHistory(ctx.config.dataDir, user.name, 20);
  const historyBlock = history
    .filter((m) => m.role !== 'system')
    .map((m) => {
      const attSummary = (m.attachments ?? []).length > 0
        ? ` [+ ${m.attachments!.length} fichier(s) joint(s)]`
        : '';
      return `${m.role === 'user' ? 'USER' : 'GALAXIA'}${attSummary}: ${m.text}`;
    })
    .join('\n\n');
  const attachBlock = buildAttachmentPromptBlock(attachments, user, ctx.config.dataDir);
  const prompt = `${CHAT_SYSTEM}\n\nConversation récente:\n${historyBlock}\n${attachBlock}\n\nRéponds à ce dernier message USER.`;

  try {
    const started = Date.now();
    const result = await callLLM(
      { dataClass: 'personal', taskType: 'dashboard-chat' },
      prompt,
      ctx.config,
    );
    const durationMs = Date.now() - started;
    const assistantMsg: ChatMessage = {
      id: randomUUID(),
      role: 'assistant',
      text: result.text,
      ts: new Date().toISOString(),
      meta: {
        provider:    result.decision.provider,
        model:       result.decision.model,
        transport:   result.decision.transport ?? undefined,
        matchedRule: result.decision.matchedRule,
        durationMs,
      },
    };
    appendChatMessage(ctx.config.dataDir, user.name, assistantMsg);
    writeJSON(res, 200, { userMessage: userMsg, assistantMessage: assistantMsg });
  } catch (err) {
    const errMsg: ChatMessage = {
      id: randomUUID(),
      role: 'system',
      text: `LLM error: ${(err as Error).message}`,
      ts: new Date().toISOString(),
    };
    appendChatMessage(ctx.config.dataDir, user.name, errMsg);
    writeJSON(res, 500, { userMessage: userMsg, assistantMessage: errMsg, error: (err as Error).message });
  }
}

export function handleGetChatHistory(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const n = Math.min(500, Math.max(1, Number(url.searchParams.get('n') ?? '100')));
  const messages = loadChatHistory(ctx.config.dataDir, ctx.user!.name, n);
  writeJSON(res, 200, { messages });
}

// ── GET /api/watch?n=50&project=<name> ─────────────────────────────────────
// Returns latest watcher findings. Scope enforced via relevantProjects:
// a collaborator only sees findings that target projects they can access
// (plus findings with empty relevantProjects — shared signal).

export function handleGetWatcherFeed(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): void {
  if (!requireAuth(res, ctx.user)) return;
  const url = new URL(req.url ?? '/', 'http://localhost');
  const n = Math.min(500, Math.max(1, Number(url.searchParams.get('n') ?? '50')));
  const projectFilter = url.searchParams.get('project');
  const all = loadWatcherFindings(ctx.config.dataDir, Math.max(n * 4, 200));
  const filtered = all.filter((f) => {
    if (projectFilter) return f.relevantProjects.includes(projectFilter);
    // Scope: if the user is owner with '*', show all. Otherwise keep findings
    // whose relevantProjects are EMPTY (general tech) or intersect the scope.
    if (isOwner(ctx.user!)) return true;
    if (!f.relevantProjects || f.relevantProjects.length === 0) return true;
    return f.relevantProjects.some((p) => userCanAccess(ctx.user!, p));
  });
  writeJSON(res, 200, { findings: filtered.slice(-n) });
}

// ── POST /api/watch  { text } ──────────────────────────────────────────────
// Owner-only (même règle que /watch Telegram). URL optionnelle dans le texte.

export async function handlePostWatcherIngest(req: IncomingMessage, res: ServerResponse, ctx: RouteContext): Promise<void> {
  if (!requireAuth(res, ctx.user)) return;
  if (!isOwner(ctx.user!)) { writeJSON(res, 403, { error: 'owner only' }); return; }
  let body: { text?: string };
  try {
    const raw = await readBody(req);
    body = JSON.parse(raw) as { text?: string };
  } catch (err) {
    writeJSON(res, 400, { error: `bad request: ${(err as Error).message}` });
    return;
  }
  const text = (body.text ?? '').trim();
  if (!text) { writeJSON(res, 400, { error: 'empty text' }); return; }
  if (text.length > 20_000) { writeJSON(res, 413, { error: 'text too long (20k max)' }); return; }
  try {
    const finding = await ingestWatcherSubmission(
      { rawText: text, submittedBy: ctx.user!.name, source: 'user-dashboard' },
      ctx.config,
    );
    writeJSON(res, 200, { finding });
  } catch (err) {
    writeJSON(res, 500, { error: (err as Error).message });
  }
}
