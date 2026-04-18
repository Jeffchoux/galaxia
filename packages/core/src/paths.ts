// GALAXIA — Paths: single source of truth for data-dir and sub-file locations.
//
// Resolution priority for the data directory:
//   1. explicit argument passed to resolveDataDir()
//   2. process.env.GALAXIA_DATA_DIR
//   3. default: ~/.galaxia/data
//
// Note: `config.dataDir` (from galaxia.yml) is layered in by the config loader,
// which calls resolveDataDir() at load time. Callers that already hold a
// resolved `dataDir` (e.g. orchestrator passing `config.dataDir`) pass it as
// the explicit argument, which wins over env.

import { join } from 'node:path';
import { homedir } from 'node:os';

function defaultDataDir(): string {
  return join(homedir(), '.galaxia', 'data');
}

export function resolveDataDir(dataDir?: string): string {
  if (dataDir) return dataDir;
  const fromEnv = process.env.GALAXIA_DATA_DIR;
  if (fromEnv && fromEnv.length > 0) return fromEnv;
  return defaultDataDir();
}

// ── Canonical sub-paths ────────────────────────────────────────────────────
// Convention: data-dir layout is
//   $dataDir/
//     state/state.json
//     logs/orchestrator.log
//     logs/routing-audit.jsonl
//     memory/projects/<name>/KNOWLEDGE.md
//     config/galaxia.yml          (searched by configSearchPaths)
//     missions.json
//     daemon.pid

export function stateDir(dataDir?: string): string {
  return join(resolveDataDir(dataDir), 'state');
}

export function stateFilePath(dataDir?: string): string {
  return join(stateDir(dataDir), 'state.json');
}

export function logsDir(dataDir?: string): string {
  return join(resolveDataDir(dataDir), 'logs');
}

export function logFilePath(dataDir?: string): string {
  return join(logsDir(dataDir), 'orchestrator.log');
}

export function routingAuditPath(dataDir?: string): string {
  return join(logsDir(dataDir), 'routing-audit.jsonl');
}

export function knowledgeDir(dataDir?: string): string {
  return join(resolveDataDir(dataDir), 'memory');
}

export function knowledgeFilePath(project: string, dataDir?: string): string {
  return join(knowledgeDir(dataDir), 'projects', project, 'KNOWLEDGE.md');
}

export function missionsFilePath(dataDir?: string): string {
  return join(resolveDataDir(dataDir), 'missions.json');
}

export function pidFilePath(dataDir?: string): string {
  return join(resolveDataDir(dataDir), 'daemon.pid');
}

export function configDir(dataDir?: string): string {
  return join(resolveDataDir(dataDir), 'config');
}

// Config file search paths, in priority order.
// 1. galaxia.yml in cwd
// 2. $dataDir/config/galaxia.yml  (instance-owned config, e.g. /root/galaxia-data/config/galaxia.yml)
// 3. ~/.galaxia/config.yml
// 4. /etc/galaxia/config.yml
export function configSearchPaths(dataDir?: string): string[] {
  return [
    'galaxia.yml',
    join(configDir(dataDir), 'galaxia.yml'),
    join(homedir(), '.galaxia', 'config.yml'),
    '/etc/galaxia/config.yml',
  ];
}
