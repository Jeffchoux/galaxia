// GALAXIA State Manager — port of /opt/agents/shared/state-update.sh
// Atomic JSON state with temp-file + rename

import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { GalaxiaState } from './types.js';
import { stateFilePath } from './paths.js';

export function getDefaultState(): GalaxiaState {
  return {
    system: {
      cpu: '0%',
      ram: '0%',
      disk: '0%',
      pm2Online: '0/0',
    },
    projects: {},
    lastUpdated: new Date().toISOString(),
    dailyStats: {
      bugsFixed: 0,
      featuresShipped: 0,
    },
  };
}

export function loadState(dataDir?: string): GalaxiaState {
  const filePath = stateFilePath(dataDir);

  if (!existsSync(filePath)) {
    return getDefaultState();
  }

  try {
    const raw = readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as GalaxiaState;
  } catch (err) {
    console.error('[state] Failed to load state:', (err as Error).message);
    return getDefaultState();
  }
}

/**
 * Atomic state update using temp file + rename.
 * keyPath supports dot notation: "projects.openjeff.status"
 */
export function updateState(keyPath: string, value: unknown, dataDir?: string): void {
  const filePath = stateFilePath(dataDir);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  const state = loadState(dataDir);
  const keys = keyPath.split('.');

  // Navigate to the parent, creating intermediate objects as needed
  let obj: Record<string, unknown> = state as unknown as Record<string, unknown>;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (typeof obj[key] !== 'object' || obj[key] === null) {
      obj[key] = {};
    }
    obj = obj[key] as Record<string, unknown>;
  }

  obj[keys[keys.length - 1]] = value;
  state.lastUpdated = new Date().toISOString();

  // Atomic write: write to temp file, then rename
  const tmpPath = join(dir, `state.tmp.${randomUUID()}.json`);
  try {
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[state] Failed to update state:', (err as Error).message);
    // Clean up temp file on failure
    try { if (existsSync(tmpPath)) writeFileSync(tmpPath, ''); } catch { /* ignore */ }
  }
}

/**
 * Replace the entire state atomically.
 */
export function saveState(state: GalaxiaState, dataDir?: string): void {
  const filePath = stateFilePath(dataDir);
  const dir = dirname(filePath);
  mkdirSync(dir, { recursive: true });

  state.lastUpdated = new Date().toISOString();
  const tmpPath = join(dir, `state.tmp.${randomUUID()}.json`);

  try {
    writeFileSync(tmpPath, JSON.stringify(state, null, 2), 'utf-8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    console.error('[state] Failed to save state:', (err as Error).message);
  }
}
