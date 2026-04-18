// GALAXIA Config Loader — reads galaxia.yml and merges with defaults.
// Supports .env loading and ${VAR} expansion in YAML values.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import type { GalaxiaConfig } from './types.js';
import { resolveDataDir, configSearchPaths } from './paths.js';

// ── .env loader ────────────────────────────────────────────────────────────
// Minimal parser. No new runtime dependency.
// - Lines starting with `#` or empty are skipped
// - `KEY=VALUE`, value may be single- or double-quoted
// - Does NOT override variables already present in process.env (env wins)

function envFileCandidates(): string[] {
  const out: string[] = [];
  if (process.env.GALAXIA_ENV_FILE) out.push(process.env.GALAXIA_ENV_FILE);
  out.push(join(process.cwd(), '.env'));
  out.push('/opt/galaxia/.env');
  return out;
}

function loadEnvFile(path: string): number {
  if (!existsSync(path)) return 0;
  let loaded = 0;
  try {
    const raw = readFileSync(path, 'utf-8');
    for (const rawLine of raw.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eq = line.indexOf('=');
      if (eq <= 0) continue;
      const key = line.slice(0, eq).trim();
      let value = line.slice(eq + 1).trim();
      // Strip matching surrounding quotes
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      if (!(key in process.env)) {
        process.env[key] = value;
        loaded++;
      }
    }
  } catch (err) {
    console.error(`[config] Failed to read env file ${path}:`, (err as Error).message);
    return 0;
  }
  return loaded;
}

export function loadEnvFiles(): void {
  for (const candidate of envFileCandidates()) {
    if (existsSync(candidate)) {
      const n = loadEnvFile(candidate);
      console.error(`[config] Loaded ${n} vars from ${candidate}`);
      return; // first hit wins
    }
  }
}

// ── ${VAR} expansion ───────────────────────────────────────────────────────

const VAR_RE = /\$\{([A-Z_][A-Z0-9_]*)\}/gi;

function expandVars(value: unknown, missing: Set<string>): unknown {
  if (typeof value === 'string') {
    return value.replace(VAR_RE, (_match, name: string) => {
      const v = process.env[name];
      if (v === undefined) {
        missing.add(name);
        return '';
      }
      return v;
    });
  }
  if (Array.isArray(value)) {
    return value.map((v) => expandVars(v, missing));
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = expandVars(v, missing);
    }
    return out;
  }
  return value;
}

// ── Defaults ───────────────────────────────────────────────────────────────

export function getDefaultConfig(): GalaxiaConfig {
  return {
    business: {
      name: 'GALAXIA',
      description: 'AI Agent Orchestration System',
    },
    llm: {
      light: {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
      },
      medium: {
        provider: 'groq',
        model: 'llama-3.3-70b-versatile',
      },
      heavy: {
        provider: 'claude',
        model: 'sonnet',
      },
      local: {
        provider: 'ollama',
        model: 'llama3.2',
        url: 'http://localhost:11434',
      },
    },
    agents: {
      mode: 'mission',
      cycleInterval: 3600,
      enabled: ['dev', 'cicd', 'test', 'analyse', 'controle', 'veille'],
    },
    notifications: {},
    projects: [],
    dataDir: resolveDataDir(),
  };
}

// ── Config file discovery + merge ──────────────────────────────────────────

function findConfigFile(configPath?: string): string | null {
  if (configPath) {
    return existsSync(configPath) ? configPath : null;
  }
  for (const p of configSearchPaths()) {
    if (existsSync(p)) return p;
  }
  return null;
}

function deepMerge<T extends Record<string, unknown>>(base: T, override: Record<string, unknown>): T {
  const result = { ...base };
  for (const key of Object.keys(override)) {
    const baseVal = (base as Record<string, unknown>)[key];
    const overVal = override[key];
    if (
      baseVal && overVal &&
      typeof baseVal === 'object' && typeof overVal === 'object' &&
      !Array.isArray(baseVal) && !Array.isArray(overVal)
    ) {
      (result as Record<string, unknown>)[key] = deepMerge(
        baseVal as Record<string, unknown>,
        overVal as Record<string, unknown>,
      );
    } else {
      (result as Record<string, unknown>)[key] = overVal;
    }
  }
  return result;
}

export function loadConfig(configPath?: string): GalaxiaConfig {
  // Load .env first so ${VAR} expansion sees the vars
  loadEnvFiles();

  const defaults = getDefaultConfig();
  const file = findConfigFile(configPath);

  if (!file) {
    console.error('[config] No galaxia.yml found, using defaults');
    // Env still wins over defaults for dataDir
    const envDataDir = process.env.GALAXIA_DATA_DIR;
    if (envDataDir) defaults.dataDir = envDataDir;
    return defaults;
  }

  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      console.error('[config] Invalid YAML in', file, '— using defaults');
      return defaults;
    }

    // Expand ${VAR} references against process.env
    const missing = new Set<string>();
    const expanded = expandVars(parsed, missing) as Record<string, unknown>;
    if (missing.size > 0) {
      console.error(
        `[config] Warning: undefined env var${missing.size > 1 ? 's' : ''} in ${file}: ${[...missing].join(', ')}`,
      );
    }

    const merged = deepMerge(
      defaults as unknown as Record<string, unknown>,
      expanded,
    ) as unknown as GalaxiaConfig;

    // GALAXIA_DATA_DIR env overrides config.dataDir per resolution priority
    // (1 arg explicit > 2 env > 3 config.dataDir > 4 default).
    const envDataDir = process.env.GALAXIA_DATA_DIR;
    if (envDataDir) merged.dataDir = envDataDir;

    console.error(`[config] Loaded from ${file}`);
    return merged;
  } catch (err) {
    console.error('[config] Failed to read', file, ':', (err as Error).message);
    return defaults;
  }
}
