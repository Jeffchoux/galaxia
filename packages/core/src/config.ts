// GALAXIA Config Loader — reads galaxia.yml and merges with defaults

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { parse as parseYaml } from 'yaml';
import type { GalaxiaConfig } from './types.js';

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
    dataDir: join(homedir(), '.galaxia', 'data'),
  };
}

const CONFIG_SEARCH_PATHS = [
  'galaxia.yml',
  join(homedir(), '.galaxia', 'config.yml'),
  '/etc/galaxia/config.yml',
];

function findConfigFile(configPath?: string): string | null {
  if (configPath) {
    return existsSync(configPath) ? configPath : null;
  }
  for (const p of CONFIG_SEARCH_PATHS) {
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
  const defaults = getDefaultConfig();
  const file = findConfigFile(configPath);

  if (!file) {
    console.error('[config] No galaxia.yml found, using defaults');
    return defaults;
  }

  try {
    const raw = readFileSync(file, 'utf-8');
    const parsed = parseYaml(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object') {
      console.error('[config] Invalid YAML in', file, '— using defaults');
      return defaults;
    }
    const merged = deepMerge(
      defaults as unknown as Record<string, unknown>,
      parsed,
    ) as unknown as GalaxiaConfig;
    console.error(`[config] Loaded from ${file}`);
    return merged;
  } catch (err) {
    console.error('[config] Failed to read', file, ':', (err as Error).message);
    return defaults;
  }
}
