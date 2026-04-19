// GALAXIA Worldseed — client (file-based bridge).
//
// Round-trip:
//   1. We append the request to WORLDSEED_REQUEST_FILE.
//   2. Worldseed (systemd user@1003) is expected to tail this file, run
//      the task under its DG prompt, and append the response to
//      WORLDSEED_RESPONSE_FILE.
//   3. We poll the response file (every 500ms) looking for the line whose
//      `id` matches ours. Timeout → WorldseedUnavailableError.
//
// If Worldseed hasn't wired its side of the bridge yet, every call
// times out. That's the expected "stub" behaviour until the hand-off is
// finalised (documented in the Phase 11 report).

import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { WorldseedCapability, WorldseedRequest, WorldseedResponse } from './types.js';
import {
  WORLDSEED_REQUEST_FILE,
  WORLDSEED_RESPONSE_FILE,
  WORLDSEED_DEFAULT_TIMEOUT_MS,
} from './types.js';

export class WorldseedUnavailableError extends Error {
  constructor(reason: string) {
    super(`Worldseed unavailable: ${reason}`);
    this.name = 'WorldseedUnavailableError';
  }
}

function ensureParentDir(file: string): void {
  mkdirSync(dirname(file), { recursive: true });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/** Pull all completed responses and return the one matching `id`. */
function findResponse(id: string): WorldseedResponse | null {
  if (!existsSync(WORLDSEED_RESPONSE_FILE)) return null;
  const content = readFileSync(WORLDSEED_RESPONSE_FILE, 'utf-8');
  // Scan last-to-first (fresh entries matter more) but don't rewrite
  // the file: Worldseed owns it. Cap the scan at 2 MiB.
  const lines = content.slice(-2 * 1024 * 1024).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as WorldseedResponse;
      if (parsed.id === id) return parsed;
    } catch { /* skip malformed */ }
  }
  return null;
}

export interface AskOptions {
  timeoutMs?: number;
  pollIntervalMs?: number;
  meta?: Record<string, unknown>;
  requestFile?: string;         // override for tests
  responseFile?: string;
}

export async function askWorldseed(
  capability: WorldseedCapability,
  prompt: string,
  options: AskOptions = {},
): Promise<WorldseedResponse> {
  const id = randomUUID();
  const req: WorldseedRequest = {
    id,
    capability,
    prompt,
    meta: options.meta,
    timeoutMs: options.timeoutMs ?? WORLDSEED_DEFAULT_TIMEOUT_MS,
    createdAt: new Date().toISOString(),
  };
  const requestFile = options.requestFile ?? WORLDSEED_REQUEST_FILE;
  const responseFile = options.responseFile ?? WORLDSEED_RESPONSE_FILE;

  ensureParentDir(requestFile);
  try {
    appendFileSync(requestFile, JSON.stringify(req) + '\n', 'utf-8');
  } catch (err) {
    throw new WorldseedUnavailableError(`cannot write request file: ${(err as Error).message}`);
  }

  const poll = options.pollIntervalMs ?? 500;
  const deadline = Date.now() + (req.timeoutMs ?? WORLDSEED_DEFAULT_TIMEOUT_MS);
  while (Date.now() < deadline) {
    const resp = findResponseInFile(id, responseFile);
    if (resp) return resp;
    await sleep(poll);
  }
  throw new WorldseedUnavailableError(`no response within ${req.timeoutMs ?? WORLDSEED_DEFAULT_TIMEOUT_MS}ms (capability=${capability})`);
}

// Test-friendly variant: explicit file parameter. The non-options entry
// above delegates to this so tests can point at tmp files.
function findResponseInFile(id: string, file: string): WorldseedResponse | null {
  if (file === WORLDSEED_RESPONSE_FILE) return findResponse(id);
  if (!existsSync(file)) return null;
  const content = readFileSync(file, 'utf-8');
  const lines = content.slice(-2 * 1024 * 1024).split('\n');
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i]?.trim();
    if (!line) continue;
    try {
      const parsed = JSON.parse(line) as WorldseedResponse;
      if (parsed.id === id) return parsed;
    } catch { /* skip malformed */ }
  }
  return null;
}
