// GALAXIA — Routing subpackage barrel.

export type {
  BuiltInDataClass,
  DataClass,
  BuiltInTaskType,
  TaskType,
  RoutingLocation,
  RoutingContext,
  TimeWindow,
  RoutingRuleWhen,
  RoutingRuleThen,
  RoutingRule,
  RoutingDecision,
  RoutingAuditEntry,
  RoutingConfig,
} from './types.js';

export { DEFAULT_RULES, DEFAULT_FALLBACK_TIER } from './default-rules.js';
export { decide, ruleMatches } from './engine.js';
export { logRouting, queryAudit, type AuditQuery } from './audit.js';
export { validateRules, type ValidationReport } from './rules.js';
