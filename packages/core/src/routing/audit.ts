// GALAXIA — Routing audit log.
//
// Append-only JSONL with size-based rotation. Never logs the prompt itself,
// only a sha256 hash and its length. This satisfies the manifesto § 3.bis
// traceability requirement ("Galaxia reports, for each action, which model
// it consulted and why") without creating a secondary exfiltration surface.

import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  statSync,
} from 'node:fs';
import { dirname } from 'node:path';
import type { GalaxiaConfig } from '../types.js';
import type {
  DataClass,
  RoutingAuditEntry,
} from './types.js';
import { routingAuditPath } from '../paths.js';

const DEFAULT_MAX_MB = 10;

function maxBytes(config: GalaxiaConfig): number {
  const mb = config.routing?.auditLogMaxMB ?? DEFAULT_MAX_MB;
  return mb * 1024 * 1024;
}

function rotateIfNeeded(path: string, limit: number): void {
  if (!existsSync(path)) return;
  let size = 0;
  try { size = statSync(path).size; } catch { return; }
  if (size < limit) return;

  const base = path.replace(/\.jsonl$/, '');
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  const mm = String(now.getUTCMinutes()).padStart(2, '0');
  let target = `${base}.${y}${m}${d}-${hh}${mm}.jsonl`;
  let n = 1;
  while (existsSync(target)) {
    target = `${base}.${y}${m}${d}-${hh}${mm}.${n}.jsonl`;
    n++;
  }
  try {
    renameSync(path, target);
  } catch (err) {
    console.error('[routing-audit] rotation failed:', (err as Error).message);
  }
}

export function logRouting(entry: RoutingAuditEntry, config: GalaxiaConfig): void {
  const path = routingAuditPath(config.dataDir);
  mkdirSync(dirname(path), { recursive: true });
  rotateIfNeeded(path, maxBytes(config));

  try {
    appendFileSync(path, JSON.stringify(entry) + '\n', 'utf-8');
  } catch (err) {
    console.error('[routing-audit] append failed:', (err as Error).message);
  }
}

export interface AuditQuery {
  since?: Date;
  projectTag?: string;
  dataClass?: DataClass;
  ruleName?: string;
  limit?: number;
}

/**
 * Reads the current audit file (not rotated ones), parses JSONL, filters,
 * returns newest-first up to `limit`. Tail-friendly for reasonable sizes;
 * does not stream.
 */
export function queryAudit(filter: AuditQuery, config: GalaxiaConfig): RoutingAuditEntry[] {
  const path = routingAuditPath(config.dataDir);
  if (!existsSync(path)) return [];

  let raw: string;
  try {
    raw = readFileSync(path, 'utf-8');
  } catch {
    return [];
  }

  const entries: RoutingAuditEntry[] = [];
  for (const line of raw.split('\n')) {
    if (!line) continue;
    try {
      const e = JSON.parse(line) as RoutingAuditEntry;
      if (filter.since && new Date(e.timestamp) < filter.since) continue;
      if (filter.projectTag && e.context.projectTag !== filter.projectTag) continue;
      if (filter.dataClass && e.context.dataClass !== filter.dataClass) continue;
      if (filter.ruleName && e.decision.matchedRule !== filter.ruleName) continue;
      entries.push(e);
    } catch {
      // skip malformed line
    }
  }

  entries.reverse(); // newest first
  if (filter.limit && filter.limit > 0) return entries.slice(0, filter.limit);
  return entries;
}
