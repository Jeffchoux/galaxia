// GALAXIA Core — GitHub discovery for Phase 8.5.
//
// Wraps the `gh` CLI to list repositories of the current authenticated
// user, and converts each to a status row ("already a piece / available /
// archived"). The Telegram /discover handler drives this through an
// inline-keyboard interface.
//
// This module intentionally shells out to `gh` instead of hitting the
// REST API directly so we inherit the user's existing auth (token, SSO,
// rate limits). When `gh` isn't authenticated, `listRepos()` surfaces a
// clear error the handler can show to the user.

import { execFileSync, execFile } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { promisify } from 'node:util';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import type { GalaxiaConfig, Project } from '../types.js';
import { configSearchPaths } from '../paths.js';

const execFileAsync = promisify(execFile);

export interface GhRepo {
  name: string;
  fullName: string;           // "owner/name"
  isPrivate: boolean;
  isArchived: boolean;
  description: string;
  url: string;
  updatedAt: string;
}

export type RepoPieceStatus =
  | 'piece'                   // already wired in galaxia.yml and dir exists
  | 'piece-orphan'            // declared in galaxia.yml but dir missing
  | 'dir-only'                // dir exists but not in galaxia.yml
  | 'archived'                // repo is archived on GitHub
  | 'available';              // candidate for createRoom

export interface DiscoveredRepo extends GhRepo {
  status: RepoPieceStatus;
}

export interface DiscoverResult {
  owner: string;              // GitHub login of the auth'd user
  repos: DiscoveredRepo[];
}

export class GhNotAuthenticatedError extends Error {
  constructor() {
    super('gh CLI is not authenticated — run `gh auth login`');
    this.name = 'GhNotAuthenticatedError';
  }
}

// ── gh CLI helpers ─────────────────────────────────────────────────────────

function hasGhCli(): boolean {
  try {
    execFileSync('gh', ['--version'], { stdio: ['ignore', 'ignore', 'ignore'] });
    return true;
  } catch {
    return false;
  }
}

function isGhAuthenticated(): boolean {
  try {
    execFileSync('gh', ['auth', 'status'], { stdio: ['ignore', 'ignore', 'pipe'] });
    return true;
  } catch {
    return false;
  }
}

async function ghJson<T>(args: string[]): Promise<T> {
  const { stdout } = await execFileAsync('gh', args, { maxBuffer: 50 * 1024 * 1024 });
  return JSON.parse(stdout) as T;
}

// ── Public API ─────────────────────────────────────────────────────────────

export async function discoverRepos(config: GalaxiaConfig): Promise<DiscoverResult> {
  if (!hasGhCli()) throw new Error('gh CLI not installed on this host');
  if (!isGhAuthenticated()) throw new GhNotAuthenticatedError();

  const who = await ghJson<{ login: string }>(['api', 'user']);
  const owner = who.login;

  // `gh repo list --limit 200` — 200 is generous; anyone with more repos
  // should bump this. --json limits the fields we serialize over.
  const raw = await ghJson<Array<{
    name: string;
    nameWithOwner: string;
    isPrivate: boolean;
    isArchived: boolean;
    description: string | null;
    url: string;
    updatedAt: string;
  }>>(['repo', 'list', '--limit', '200', '--json',
      'name,nameWithOwner,isPrivate,isArchived,description,url,updatedAt']);

  const declaredPieces = new Map((config.projects ?? []).map((p) => [p.name, p]));
  const piecesRoot = join('/opt/galaxia/projects');

  const repos: DiscoveredRepo[] = raw.map((r) => {
    const gh: GhRepo = {
      name: r.name,
      fullName: r.nameWithOwner,
      isPrivate: r.isPrivate,
      isArchived: r.isArchived,
      description: r.description ?? '',
      url: r.url,
      updatedAt: r.updatedAt,
    };
    return { ...gh, status: computeStatus(gh, declaredPieces, piecesRoot) };
  });

  return { owner, repos };
}

function computeStatus(
  repo: GhRepo,
  declaredPieces: Map<string, Project>,
  piecesRoot: string,
): RepoPieceStatus {
  if (repo.isArchived) return 'archived';
  const inYaml = declaredPieces.has(repo.name);
  const dir = join(piecesRoot, repo.name);
  const dirExists = existsSync(dir) && safeIsDir(dir);
  if (inYaml && dirExists) return 'piece';
  if (inYaml && !dirExists) return 'piece-orphan';
  if (!inYaml && dirExists) return 'dir-only';
  return 'available';
}

function safeIsDir(p: string): boolean {
  try { return statSync(p).isDirectory(); } catch { return false; }
}

// ── createRoom — clone + wire in galaxia.yml ───────────────────────────────

export interface CreateRoomOptions {
  cloneUrl?: string;          // explicit; otherwise we `gh repo clone owner/name`
  description?: string;       // forwarded to galaxia.yml
  configPath?: string;        // override YAML path; default = first of configSearchPaths()
}

export interface CreateRoomResult {
  name: string;
  path: string;
  galaxiaYmlPath: string;
  alreadyDeclared: boolean;
}

export async function createRoom(
  fullName: string,             // "owner/repo"
  config: GalaxiaConfig,
  options: CreateRoomOptions = {},
): Promise<CreateRoomResult> {
  if (!hasGhCli()) throw new Error('gh CLI not installed on this host');
  const parts = fullName.split('/');
  if (parts.length !== 2) throw new Error(`createRoom: expected owner/repo, got "${fullName}"`);
  const repoName = parts[1];
  const piecesRoot = '/opt/galaxia/projects';
  const targetDir = join(piecesRoot, repoName);

  // 1. Clone (if not already there).
  if (!existsSync(join(targetDir, '.git'))) {
    mkdirSync(piecesRoot, { recursive: true });
    await execFileAsync('gh', ['repo', 'clone', fullName, targetDir]);
  }

  // 2. GALAXIA_PIECE.md (skip if user already authored one).
  const pieceMd = join(targetDir, 'GALAXIA_PIECE.md');
  if (!existsSync(pieceMd)) {
    writeFileSync(pieceMd, [
      `# ${repoName} — pièce Galaxia`,
      '',
      `Pièce créée par Phase 8.5 GitHub Discovery le ${new Date().toISOString()}.`,
      `Repo source : ${fullName}`,
      '',
      'Cette pièce a été clonée depuis GitHub par l\'interface `/discover` de Galaxia.',
    ].join('\n'), 'utf-8');
  }

  // 3. galaxia.yml — append project entry if not already declared.
  const yamlPath = options.configPath ?? resolveConfigPath();
  const alreadyDeclared = (config.projects ?? []).some((p) => p.name === repoName);
  if (!alreadyDeclared) {
    upsertProjectInYaml(yamlPath, {
      name: repoName,
      path: targetDir,
      description: options.description ?? `Cloned from ${fullName} via /discover.`,
    });
  }

  return {
    name: repoName,
    path: targetDir,
    galaxiaYmlPath: yamlPath,
    alreadyDeclared,
  };
}

function resolveConfigPath(): string {
  for (const p of configSearchPaths()) {
    if (existsSync(p)) return p;
  }
  throw new Error('No galaxia.yml found in search paths');
}

function upsertProjectInYaml(
  yamlPath: string,
  entry: { name: string; path: string; description?: string },
): void {
  const raw = readFileSync(yamlPath, 'utf-8');
  const parsed = (parseYaml(raw) as Record<string, unknown>) ?? {};
  const list = Array.isArray(parsed.projects) ? [...(parsed.projects as unknown[])] : [];
  // Guard against double-insert if the YAML wasn't the same as the in-memory
  // config snapshot (race / out-of-date config param).
  const existingIdx = list.findIndex((p) => (p as { name?: string }).name === entry.name);
  if (existingIdx >= 0) {
    list[existingIdx] = { ...(list[existingIdx] as object), ...entry };
  } else {
    list.push(entry);
  }
  parsed.projects = list;
  mkdirSync(dirname(yamlPath), { recursive: true });
  writeFileSync(yamlPath, stringifyYaml(parsed), 'utf-8');
}

// ── archiveRepo — gh repo archive ─────────────────────────────────────────

export async function archiveRepo(fullName: string): Promise<void> {
  if (!hasGhCli()) throw new Error('gh CLI not installed on this host');
  await execFileAsync('gh', ['repo', 'archive', fullName, '--yes']);
}
