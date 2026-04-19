// GALAXIA General Manager — persistence (state + journal).
//
// Each project gets its own folder under memory/projects/<name>/:
//   - gm-state.json    : current GMState (overwritten on every save)
//   - gm-journal.jsonl : append-only log of actions / decisions

import { existsSync, readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { GMState, GMAction } from './types.js';
import { defaultGMState } from './types.js';

export function gmDir(dataDir: string, project: string): string {
  return join(dataDir, 'memory', 'projects', project);
}
export function gmStatePath(dataDir: string, project: string): string {
  return join(gmDir(dataDir, project), 'gm-state.json');
}
export function gmJournalPath(dataDir: string, project: string): string {
  return join(gmDir(dataDir, project), 'gm-journal.jsonl');
}

export function loadGMState(dataDir: string, project: string): GMState {
  const p = gmStatePath(dataDir, project);
  if (!existsSync(p)) return defaultGMState(project);
  try {
    const parsed = JSON.parse(readFileSync(p, 'utf-8')) as GMState;
    // Upgrade any missing required field (defensive).
    const defaults = defaultGMState(project);
    return {
      ...defaults,
      ...parsed,
      currentObjectives: parsed.currentObjectives ?? [],
      recentActions: parsed.recentActions ?? [],
    };
  } catch {
    return defaultGMState(project);
  }
}

export function saveGMState(dataDir: string, state: GMState): void {
  const p = gmStatePath(dataDir, state.project);
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
}

export function appendJournal(dataDir: string, project: string, entry: GMAction): void {
  const p = gmJournalPath(dataDir, project);
  mkdirSync(dirname(p), { recursive: true });
  appendFileSync(p, JSON.stringify(entry) + '\n', 'utf-8');
}

export function tailJournal(dataDir: string, project: string, n: number): GMAction[] {
  const p = gmJournalPath(dataDir, project);
  if (!existsSync(p)) return [];
  try {
    const lines = readFileSync(p, 'utf-8').split('\n').filter(Boolean);
    return lines.slice(-n).map((l) => JSON.parse(l) as GMAction);
  } catch {
    return [];
  }
}
