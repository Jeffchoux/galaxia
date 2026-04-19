// GALAXIA General Manager — per-project orchestrator.
//
// One ProjectGM per project. Runs review() on an interval, which loads
// state, asks the brain for a decision, acts on it, appends to the
// journal, and saves the updated state. Dispatching an agent uses the
// same TS-agent path as the main orchestrator (@galaxia/agents).

import { randomUUID } from 'node:crypto';
import type { GalaxiaConfig, Project, AgentType } from '../types.js';
import { decideNext } from './brain.js';
import {
  loadGMState, saveGMState, appendJournal,
} from './persistence.js';
import type {
  GMConfig, GMState, GMAction, GMObjective, GMDecision,
} from './types.js';
import { GM_DEFAULT_INTERVAL_MIN, GM_MIN_INTERVAL_MIN, GM_RECENT_ACTIONS_CAP } from './types.js';

type AgentRunner = (agent: AgentType, task: string, project: Project, config: GalaxiaConfig)
  => Promise<{ success: boolean; summary: string }>;

export interface ProjectGMOptions {
  /** Override the agent dispatcher (tests inject a fake). Default uses
   * the dynamic-import-from-disk path that orchestrator.ts uses. */
  agentRunner?: AgentRunner;
  /** Clock injection for tests. */
  now?: () => Date;
}

export class ProjectGM {
  private readonly agentRunner: AgentRunner;
  private readonly now: () => Date;

  constructor(
    private readonly project: Project,
    private readonly gmConfig: GMConfig | undefined,
    private readonly config: GalaxiaConfig,
    options: ProjectGMOptions = {},
  ) {
    this.agentRunner = options.agentRunner ?? defaultAgentRunner;
    this.now = options.now ?? (() => new Date());
  }

  getState(): GMState {
    return loadGMState(this.config.dataDir, this.project.name);
  }

  saveState(patch: Partial<GMState>): GMState {
    const current = this.getState();
    const next: GMState = { ...current, ...patch };
    saveGMState(this.config.dataDir, next);
    return next;
  }

  addObjective(description: string, createdBy?: string): GMObjective {
    const obj: GMObjective = {
      id: `obj-${Date.now().toString(36)}-${randomUUID().slice(0, 4)}`,
      description,
      createdAt: this.now().toISOString(),
      createdBy,
      priority: 3,
      status: 'active',
    };
    const state = this.getState();
    this.saveState({
      currentObjectives: [...state.currentObjectives, obj],
    });
    return obj;
  }

  pause(): void { this.saveState({ paused: true }); }
  resume(): void { this.saveState({ paused: false }); }

  /**
   * One review cycle: ask the brain, act on its decision, journal it,
   * update state. Returns the decision so tests and /gm commands can
   * inspect it.
   */
  async review(): Promise<GMDecision> {
    const state = this.getState();
    if (state.paused) {
      const reason = 'paused';
      appendJournal(this.config.dataDir, this.project.name, {
        ts: this.now().toISOString(), kind: 'review', reason,
      });
      return { kind: 'wait', reason };
    }

    // Git sync guard — évite qu'un GM local travaille sur du code
    // périmé si Jeff (ou un collaborateur) a pushé depuis ailleurs.
    // syncPiece() ne throw jamais; il retourne un outcome structuré.
    const { syncPiece, describeSyncOutcome } = await import('../git-sync/index.js');
    const sync = await syncPiece(this.project.path);
    if (!sync.ok) {
      const ts0 = this.now().toISOString();
      const reason = `git sync blocked: ${describeSyncOutcome(sync)}`;
      appendJournal(this.config.dataDir, this.project.name, {
        ts: ts0, kind: 'review', reason,
      });
      // État inchangé sauf nextReviewAt, on retente au prochain tick.
      const interval = Math.max(GM_MIN_INTERVAL_MIN, this.gmConfig?.intervalMinutes ?? GM_DEFAULT_INTERVAL_MIN);
      this.saveState({
        lastReviewAt: ts0,
        nextReviewAt: new Date(this.now().getTime() + interval * 60_000).toISOString(),
      });
      return { kind: 'wait', reason };
    }
    // Si on a pullé quelque chose, on l'inscrit en journal info (kind=review).
    if (sync.action === 'pulled') {
      appendJournal(this.config.dataDir, this.project.name, {
        ts: this.now().toISOString(), kind: 'review',
        reason: describeSyncOutcome(sync),
      });
    }

    const decision = await decideNext(this.project, state, this.gmConfig, this.config);
    const ts = this.now().toISOString();
    let action: GMAction;
    let nextState: Partial<GMState> = {};
    const intervalMin = Math.max(GM_MIN_INTERVAL_MIN, this.gmConfig?.intervalMinutes ?? GM_DEFAULT_INTERVAL_MIN);

    switch (decision.kind) {
      case 'dispatch': {
        action = {
          ts,
          kind: 'dispatch',
          agent: decision.agent,
          task: decision.task,
          reason: decision.reason,
        };
        try {
          const res = await this.agentRunner(decision.agent, decision.task, this.project, this.config);
          action.outcome = res.success ? 'success' : 'failure';
        } catch (err) {
          action.outcome = 'failure';
          action.reason = `${action.reason} | dispatch error: ${(err as Error).message.slice(0, 80)}`;
        }
        break;
      }
      case 'drop-objective': {
        const state2 = this.getState();
        const remaining = state2.currentObjectives.filter((o) => o.id !== decision.objectiveId);
        nextState.currentObjectives = remaining;
        action = { ts, kind: 'review', reason: `dropped ${decision.objectiveId}: ${decision.reason}` };
        break;
      }
      case 'wait':
      default: {
        action = { ts, kind: 'wait', reason: decision.reason };
        break;
      }
    }

    // Update state atomically: append to recentActions, bump counters.
    const current = this.getState();
    const recent = [...current.recentActions, action].slice(-GM_RECENT_ACTIONS_CAP);
    const nextMs = this.now().getTime() + intervalMin * 60 * 1000;
    const merged: Partial<GMState> = {
      ...nextState,
      recentActions: recent,
      lastReviewAt: ts,
      nextReviewAt: new Date(nextMs).toISOString(),
      cyclesRun: current.cyclesRun + 1,
    };
    this.saveState(merged);
    appendJournal(this.config.dataDir, this.project.name, action);
    return decision;
  }
}

/** Default dispatcher — dynamic import via the monorepo layout,
 * identical technique to orchestrator.dispatchAction. */
const defaultAgentRunner: AgentRunner = async (agent, task, project, config) => {
  // gm/manager.js at /opt/galaxia/packages/core/dist/gm/manager.js —
  // three `../` hops reach `packages/`.
  const url = new URL('../../../agents/dist/index.js', import.meta.url).href;
  const mod = (await import(url)) as {
    getAgent: (t: string) => { run: (task: string, ctx: unknown) => Promise<{ success: boolean; summary: string }> };
  };
  const role = mod.getAgent(agent);
  return role.run(task, { project, config, dataDir: config.dataDir });
};
