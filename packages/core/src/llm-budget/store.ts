// GALAXIA — persistent LLM budget tracker.
//
// Suit l'état par tier (ou par provider:model) : cooldown, dernière
// erreur, compteur. Persisté en JSON sous memory/llm-budget.json pour
// survivre aux restarts daemon. Pas de dépendance, 1 fichier plat.

import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface TierState {
  cooldownUntil: string | null;    // ISO, null si dispo
  lastError: string | null;
  lastErrorAt: string | null;
  errorCount: number;              // compteur depuis le dernier succès
  successCount: number;            // compteur depuis le dernier échec
}

export interface LLMBudgetState {
  tiers: Record<string, TierState>;
  updatedAt: string;
}

export function budgetPath(dataDir: string): string {
  return join(dataDir, 'memory', 'llm-budget.json');
}

function emptyState(): LLMBudgetState {
  return { tiers: {}, updatedAt: new Date().toISOString() };
}

function emptyTier(): TierState {
  return { cooldownUntil: null, lastError: null, lastErrorAt: null, errorCount: 0, successCount: 0 };
}

export function loadBudget(dataDir: string): LLMBudgetState {
  const p = budgetPath(dataDir);
  if (!existsSync(p)) return emptyState();
  try {
    const raw = readFileSync(p, 'utf-8');
    const parsed = JSON.parse(raw) as LLMBudgetState;
    return { ...emptyState(), ...parsed, tiers: parsed.tiers ?? {} };
  } catch {
    return emptyState();
  }
}

export function saveBudget(dataDir: string, state: LLMBudgetState): void {
  const p = budgetPath(dataDir);
  mkdirSync(dirname(p), { recursive: true });
  state.updatedAt = new Date().toISOString();
  writeFileSync(p, JSON.stringify(state, null, 2), 'utf-8');
}

function getTier(state: LLMBudgetState, key: string): TierState {
  if (!state.tiers[key]) state.tiers[key] = emptyTier();
  return state.tiers[key];
}

/** Mark a tier as cooled down until `cooldownUntil`. */
export function markCooldown(
  dataDir: string,
  tierKey: string,
  durationMs: number,
  errorMessage: string,
): void {
  const state = loadBudget(dataDir);
  const t = getTier(state, tierKey);
  const until = new Date(Date.now() + durationMs).toISOString();
  t.cooldownUntil = until;
  t.lastError = errorMessage.slice(0, 300);
  t.lastErrorAt = new Date().toISOString();
  t.errorCount += 1;
  t.successCount = 0;
  saveBudget(dataDir, state);
}

/** Record a success — clears cooldown if expired, increments counter. */
export function markSuccess(dataDir: string, tierKey: string): void {
  const state = loadBudget(dataDir);
  const t = getTier(state, tierKey);
  if (t.cooldownUntil && Date.parse(t.cooldownUntil) <= Date.now()) {
    t.cooldownUntil = null;
  }
  t.successCount += 1;
  saveBudget(dataDir, state);
}

/** True if tier is currently cooled down (cooldownUntil > now). */
export function isCooledDown(dataDir: string, tierKey: string): boolean {
  const state = loadBudget(dataDir);
  const t = state.tiers[tierKey];
  if (!t || !t.cooldownUntil) return false;
  return Date.parse(t.cooldownUntil) > Date.now();
}

export function tierKey(tier: string, provider: string, model: string): string {
  return `${tier}:${provider}:${model}`;
}

/**
 * Classify an LLM error message into a cooldown duration (ms).
 * Returns null if the error is not a rate-limit / quota signal.
 */
export function classifyErrorForCooldown(message: string): { durationMs: number; reason: string } | null {
  const m = message.toLowerCase();
  if (/credit balance is too low|insufficient credits|quota exceeded|usage limit/i.test(message)) {
    return { durationMs: 5 * 60 * 60 * 1000, reason: 'credit/quota exhausted' }; // 5h
  }
  if (/5-?hour usage limit|max window|subscription limit/i.test(message)) {
    return { durationMs: 5 * 60 * 60 * 1000, reason: 'max window limit' };
  }
  if (/429|too many requests|rate limit/i.test(m)) {
    return { durationMs: 2 * 60 * 1000, reason: 'rate limit' }; // 2min
  }
  if (/timed? ?out|etimedout|timeout|network|econnreset/i.test(m)) {
    return { durationMs: 30 * 1000, reason: 'network/timeout' }; // 30s
  }
  return null;
}
