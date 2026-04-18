// GALAXIA — Routing types (Pilier 4.bis).
// Extensible taxonomy: built-in values are a closed set for typos-early
// checking, but end-users can extend with their own strings via galaxia.yml.

import type { LLMTier, LLMProvider } from '../types.js';

export type BuiltInDataClass =
  | 'public'
  | 'personal'
  | 'professional'
  | 'confidential'
  | 'secret';

// Extensible: users can use their own strings in config.
// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type DataClass = BuiltInDataClass | (string & {});

export type BuiltInTaskType =
  | 'triage'
  | 'analysis'
  | 'code-gen'
  | 'code-review'
  | 'creative-writing'
  | 'summarization'
  | 'search'
  | 'data-extraction'
  | 'translation';

// eslint-disable-next-line @typescript-eslint/no-redundant-type-constituents
export type TaskType = BuiltInTaskType | (string & {});

export type RoutingLocation = 'local-only' | 'prefer-local' | 'any' | 'eu-only';

export interface RoutingContext {
  dataClass: DataClass;
  taskType: TaskType;
  projectTag?: string;
  // 0-10 override; optional, pure authoring signal for rules to inspect.
  sensitivity?: number;
  location?: RoutingLocation;
}

export interface TimeWindow {
  daysOfWeek?: number[];         // 0 = Sunday, 6 = Saturday
  hoursOfDay?: [number, number]; // [startHourInclusive, endHourExclusive], 0-24
}

export interface RoutingRuleWhen {
  dataClass?: DataClass;
  dataClassIn?: DataClass[];
  taskType?: TaskType;
  taskTypeIn?: TaskType[];
  projectTag?: string;
  projectIn?: string[];
  timeWindow?: TimeWindow;
  minSensitivity?: number;
}

export interface RoutingRuleThen {
  tier?: LLMTier;            // must exist in config.llm
  provider?: LLMProvider;    // direct override
  model?: string;            // model override
  forbidFallback?: boolean;  // if true, no fallback chain on error
}

export interface RoutingRule {
  name: string;
  description?: string;
  when: RoutingRuleWhen;
  then: RoutingRuleThen;
}

export interface RoutingDecision {
  matchedRule: string;       // '__default__' when no user rule matched
  tier: LLMTier;
  provider: LLMProvider;
  model: string;
  reason: string;            // human-readable single sentence
  fallbackTried: string[];   // provider names tried before success
  forbidFallback: boolean;   // final effective value after strictLocalOnly
}

export interface RoutingAuditEntry {
  timestamp: string;         // ISO 8601
  context: RoutingContext;
  decision: RoutingDecision;
  promptHash: string;        // sha256 hex, not the prompt itself
  promptLength: number;      // characters
  success: boolean;
  latencyMs: number;
  errorMessage?: string;
}

export interface RoutingConfig {
  rules?: RoutingRule[];
  strictLocalOnly?: boolean;  // default: true (manifesto § 3.bis)
  auditLogMaxMB?: number;     // default: 10
}
