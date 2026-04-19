// GALAXIA Watcher — feed persistence (JSONL).

import { existsSync, readFileSync, appendFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import type { WatchFinding } from './types.js';
import { WATCHER_FEED_CAP_ENTRIES } from './types.js';

export function watcherFeedPath(dataDir: string): string {
  return join(dataDir, 'memory', 'global-watch.jsonl');
}

export function appendFinding(dataDir: string, finding: WatchFinding): void {
  const path = watcherFeedPath(dataDir);
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(path, JSON.stringify(finding) + '\n', 'utf-8');
  // Periodic trim: if we're past the cap, rewrite the file with the last N.
  try {
    const content = readFileSync(path, 'utf-8');
    const lines = content.split('\n').filter(Boolean);
    if (lines.length > WATCHER_FEED_CAP_ENTRIES * 1.2) {
      const trimmed = lines.slice(-WATCHER_FEED_CAP_ENTRIES).join('\n') + '\n';
      writeFileSync(path, trimmed, 'utf-8');
    }
  } catch { /* trim is best-effort */ }
}

export function loadFindings(dataDir: string, limit: number = 50): WatchFinding[] {
  const path = watcherFeedPath(dataDir);
  if (!existsSync(path)) return [];
  try {
    const raw = readFileSync(path, 'utf-8');
    const lines = raw.split('\n').filter(Boolean);
    const out: WatchFinding[] = [];
    for (const line of lines.slice(-Math.max(limit, 1))) {
      try { out.push(JSON.parse(line) as WatchFinding); } catch { /* skip malformed */ }
    }
    return out;
  } catch { return []; }
}

/** Latest N findings relevant to a given project (project name matched against `relevantProjects`). */
export function loadFindingsForProject(dataDir: string, projectName: string, limit: number = 5): WatchFinding[] {
  const all = loadFindings(dataDir, 500);
  return all.filter((f) => f.relevantProjects.includes(projectName)).slice(-limit);
}
