// GALAXIA General Manager — Phase 10 types.
//
// Each project can have its own GM: a persistent IA that tracks its
// objectives, reviews state every N minutes, and decides which agent to
// dispatch (or to wait). Jeff's Option C: GMs are autonomous but accept
// high-level objectives injected via /objective Telegram or the dashboard.

import type { AgentType } from '../types.js';

/** Config piece attached per project in galaxia.yml. */
export interface GMConfig {
  enabled: boolean;
  /** Minutes between reviews. Default 30. Floor 5. */
  intervalMinutes?: number;
  /** Optional LLM hint: if set, GM brain asks the engine to route to this tier. */
  preferredTier?: 'light' | 'medium' | 'heavy' | 'local';
  /** Extra system prompt appended to the default GM brain. */
  extraSystem?: string;
}

/** A single objective the GM should work against. */
export interface GMObjective {
  id: string;
  description: string;
  createdAt: string;
  createdBy?: string;   // user name when injected via /objective
  priority?: 1 | 2 | 3 | 4 | 5;
  status: 'active' | 'done' | 'dropped';
}

/** What the GM has done / plans to do — persisted in gm-state.json. */
export interface GMState {
  project: string;
  enabled: boolean;
  paused: boolean;
  healthScore: number;        // 0..1
  currentObjectives: GMObjective[];
  recentActions: GMAction[];  // ring buffer, last N decisions
  lastReviewAt?: string;
  nextReviewAt?: string;
  cyclesRun: number;
}

export interface GMAction {
  ts: string;
  kind: 'dispatch' | 'wait' | 'review' | 'error';
  agent?: AgentType;
  task?: string;
  reason: string;
  outcome?: 'success' | 'failure';
}

/** GM brain decides one of these per review. */
export type GMDecision =
  | { kind: 'dispatch'; agent: AgentType; task: string; reason: string; priority: 1 | 2 | 3 | 4 | 5 }
  | { kind: 'wait'; reason: string; untilNextReviewIn?: number }
  | { kind: 'drop-objective'; objectiveId: string; reason: string };

export function defaultGMState(project: string): GMState {
  return {
    project,
    enabled: false,
    paused: false,
    healthScore: 1,
    currentObjectives: [],
    recentActions: [],
    cyclesRun: 0,
  };
}

export const GM_DEFAULT_INTERVAL_MIN = 30;
export const GM_MIN_INTERVAL_MIN = 5;
export const GM_RECENT_ACTIONS_CAP = 20;
