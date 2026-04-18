// GALAXIA — Routing engine.
//
// Maps a RoutingContext to a concrete provider/model decision against
// config.routing.rules (+ built-in defaults as tail). First match wins.
//
// Safety: if strictLocalOnly is set (default true) and the incoming context
// carries confidential/secret data, the engine forces tier='local' and
// forbidFallback=true regardless of what the matched rule said. The
// manifesto § 3.bis requires that the framework itself guarantees
// confidential data never leaves the machine — it cannot depend on user
// rules being written correctly.

import type { GalaxiaConfig, LLMProvider, LLMTier } from '../types.js';
import type {
  RoutingContext,
  RoutingDecision,
  RoutingRule,
  RoutingRuleWhen,
  TimeWindow,
} from './types.js';
import { DEFAULT_RULES, DEFAULT_FALLBACK_TIER } from './default-rules.js';

const SENSITIVE_CLASSES = new Set(['confidential', 'secret']);

function inWindow(win: TimeWindow, now = new Date()): boolean {
  if (win.daysOfWeek && !win.daysOfWeek.includes(now.getDay())) return false;
  if (win.hoursOfDay) {
    const [start, end] = win.hoursOfDay;
    const hour = now.getHours();
    if (start <= end) {
      if (hour < start || hour >= end) return false;
    } else {
      // overnight window, e.g. [22, 6]
      if (hour < start && hour >= end) return false;
    }
  }
  return true;
}

export function ruleMatches(when: RoutingRuleWhen, ctx: RoutingContext): boolean {
  if (when.dataClass !== undefined && when.dataClass !== ctx.dataClass) return false;
  if (when.dataClassIn && !when.dataClassIn.includes(ctx.dataClass)) return false;
  if (when.taskType !== undefined && when.taskType !== ctx.taskType) return false;
  if (when.taskTypeIn && !when.taskTypeIn.includes(ctx.taskType)) return false;
  if (when.projectTag !== undefined && when.projectTag !== ctx.projectTag) return false;
  if (when.projectIn && (!ctx.projectTag || !when.projectIn.includes(ctx.projectTag))) return false;
  if (when.minSensitivity !== undefined && (ctx.sensitivity ?? 0) < when.minSensitivity) return false;
  if (when.timeWindow && !inWindow(when.timeWindow)) return false;
  return true;
}

function effectiveRules(config: GalaxiaConfig): RoutingRule[] {
  const userRules = config.routing?.rules ?? [];
  return [...userRules, ...DEFAULT_RULES];
}

function resolveTierProvider(
  tier: LLMTier,
  config: GalaxiaConfig,
): { provider: LLMProvider; model: string } {
  const cfg = config.llm[tier];
  return { provider: cfg.provider, model: cfg.model };
}

export function decide(ctx: RoutingContext, config: GalaxiaConfig): RoutingDecision {
  const strict = config.routing?.strictLocalOnly ?? true;
  const rules = effectiveRules(config);

  let matchedRule = '__default__';
  let tier: LLMTier = DEFAULT_FALLBACK_TIER;
  let forbidFallback = false;
  let providerOverride: LLMProvider | undefined;
  let modelOverride: string | undefined;
  let reasonCore = `no rule matched — fallback to default tier '${DEFAULT_FALLBACK_TIER}'`;

  for (const rule of rules) {
    if (ruleMatches(rule.when, ctx)) {
      matchedRule = rule.name;
      if (rule.then.tier) tier = rule.then.tier;
      if (rule.then.provider) providerOverride = rule.then.provider;
      if (rule.then.model) modelOverride = rule.then.model;
      forbidFallback = rule.then.forbidFallback ?? false;
      reasonCore = `rule '${rule.name}' matched (${formatMatchReason(rule.when)})`;
      break;
    }
  }

  // strictLocalOnly safety net: confidential/secret must go local regardless
  // of what the rule said.
  const isSensitive = SENSITIVE_CLASSES.has(String(ctx.dataClass));
  let overrideNote = '';
  if (strict && isSensitive && tier !== 'local') {
    overrideNote = ` [overridden to tier 'local' by strictLocalOnly: dataClass='${ctx.dataClass}']`;
    tier = 'local';
    providerOverride = undefined;
    modelOverride = undefined;
    forbidFallback = true;
  }
  if (strict && isSensitive && !forbidFallback) {
    // Never allow fallback chains for sensitive data, even if the rule forgot
    // to set it.
    forbidFallback = true;
    overrideNote += ' [forbidFallback forced true by strictLocalOnly]';
  }

  const { provider: tierProvider, model: tierModel } = resolveTierProvider(tier, config);
  const provider = providerOverride ?? tierProvider;
  const model = modelOverride ?? tierModel;

  return {
    matchedRule,
    tier,
    provider,
    model,
    reason: reasonCore + overrideNote,
    fallbackTried: [],
    forbidFallback,
  };
}

function formatMatchReason(when: RoutingRuleWhen): string {
  const parts: string[] = [];
  if (when.dataClass) parts.push(`dataClass=${when.dataClass}`);
  if (when.dataClassIn) parts.push(`dataClass∈${JSON.stringify(when.dataClassIn)}`);
  if (when.taskType) parts.push(`taskType=${when.taskType}`);
  if (when.taskTypeIn) parts.push(`taskType∈${JSON.stringify(when.taskTypeIn)}`);
  if (when.projectTag) parts.push(`projectTag=${when.projectTag}`);
  if (when.projectIn) parts.push(`projectTag∈${JSON.stringify(when.projectIn)}`);
  if (when.minSensitivity !== undefined) parts.push(`sensitivity≥${when.minSensitivity}`);
  if (when.timeWindow) parts.push('timeWindow');
  return parts.length ? parts.join(', ') : 'always';
}
