// GALAXIA — Routing rule validation.
//
// Runs once at config load. Returns a structured report (ok/errors/warnings)
// so callers can decide whether to reject the config or just warn. Validation
// is intentionally strict on things that would silently misroute data, and
// lenient on stylistic choices.

import type { GalaxiaConfig, LLMTier } from '../types.js';
import type { RoutingRule, RoutingRuleWhen, RoutingRuleThen } from './types.js';

export interface ValidationReport {
  ok: boolean;
  errors: string[];
  warnings: string[];
}

const VALID_TIERS: readonly LLMTier[] = ['light', 'medium', 'heavy', 'local'];

function whenIsEmpty(when: RoutingRuleWhen): boolean {
  return (
    when.dataClass === undefined &&
    (!when.dataClassIn || when.dataClassIn.length === 0) &&
    when.taskType === undefined &&
    (!when.taskTypeIn || when.taskTypeIn.length === 0) &&
    when.projectTag === undefined &&
    (!when.projectIn || when.projectIn.length === 0) &&
    when.timeWindow === undefined &&
    when.minSensitivity === undefined
  );
}

function thenIsEmpty(then: RoutingRuleThen): boolean {
  return (
    then.tier === undefined &&
    then.provider === undefined &&
    then.model === undefined &&
    then.forbidFallback === undefined
  );
}

function serializeWhen(when: RoutingRuleWhen): string {
  return JSON.stringify(when);
}

export function validateRules(
  rules: RoutingRule[],
  config?: GalaxiaConfig,
): ValidationReport {
  const errors: string[] = [];
  const warnings: string[] = [];
  const names = new Set<string>();
  const whenSigs = new Map<string, string>(); // sig -> name

  for (const [idx, rule] of rules.entries()) {
    const label = `rules[${idx}]${rule.name ? ` '${rule.name}'` : ''}`;

    if (!rule.name || typeof rule.name !== 'string') {
      errors.push(`${label}: missing or non-string 'name'`);
    } else if (names.has(rule.name)) {
      errors.push(`${label}: duplicate rule name '${rule.name}'`);
    } else {
      names.add(rule.name);
    }

    if (!rule.when || typeof rule.when !== 'object') {
      errors.push(`${label}: missing 'when' object`);
      continue;
    }
    if (whenIsEmpty(rule.when)) {
      errors.push(`${label}: 'when' is empty — rule would match all contexts. Refuse.`);
    }

    if (!rule.then || typeof rule.then !== 'object') {
      errors.push(`${label}: missing 'then' object`);
      continue;
    }
    if (thenIsEmpty(rule.then)) {
      errors.push(`${label}: 'then' is empty — rule would have no effect`);
    }

    if (rule.then.tier !== undefined && !VALID_TIERS.includes(rule.then.tier)) {
      errors.push(`${label}: invalid tier '${rule.then.tier}' (expected ${VALID_TIERS.join('|')})`);
    }
    if (rule.then.tier !== undefined && config && !config.llm[rule.then.tier]) {
      errors.push(`${label}: tier '${rule.then.tier}' not configured in config.llm`);
    }

    if (rule.when.timeWindow) {
      const tw = rule.when.timeWindow;
      if (tw.daysOfWeek) {
        for (const d of tw.daysOfWeek) {
          if (!Number.isInteger(d) || d < 0 || d > 6) {
            errors.push(`${label}: timeWindow.daysOfWeek contains invalid value ${d} (0-6)`);
          }
        }
      }
      if (tw.hoursOfDay) {
        const [a, b] = tw.hoursOfDay;
        if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || a > 24 || b < 0 || b > 24) {
          errors.push(`${label}: timeWindow.hoursOfDay invalid [${a}, ${b}] (expected 0-24)`);
        }
      }
    }

    if (rule.when.minSensitivity !== undefined) {
      const s = rule.when.minSensitivity;
      if (typeof s !== 'number' || s < 0 || s > 10) {
        errors.push(`${label}: minSensitivity must be a number in [0,10], got ${String(s)}`);
      }
    }

    // Trivial duplicate detection: identical 'when' blocks
    const sig = serializeWhen(rule.when);
    const prior = whenSigs.get(sig);
    if (prior) {
      warnings.push(`${label}: identical 'when' to earlier rule '${prior}'. The earlier rule wins — this one is dead.`);
    } else {
      whenSigs.set(sig, rule.name);
    }

    // Safety warnings for dangerous shapes
    if (
      (rule.when.dataClass === 'confidential' || rule.when.dataClass === 'secret' ||
       rule.when.dataClassIn?.includes('confidential') || rule.when.dataClassIn?.includes('secret')) &&
      rule.then.forbidFallback === false
    ) {
      warnings.push(`${label}: matches confidential/secret data but forbidFallback=false. strictLocalOnly will override this at runtime, but consider setting forbidFallback=true explicitly.`);
    }
  }

  return { ok: errors.length === 0, errors, warnings };
}
