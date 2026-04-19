import type { GalaxiaConfig, AgentType, Project, KnowledgeEntry, ActionPlan } from '@galaxia/core';

export interface AgentContext {
  project: Project;
  config: GalaxiaConfig;
  dataDir: string;
}

export interface AgentResult {
  success: boolean;
  summary: string;
  actions: string[];
  knowledgeLearned: KnowledgeEntry[];
  errors: string[];
  // Phase 9 — optional typed action plan produced by the agent. When
  // present, Telegram /plan and ProjectGM run it through the central
  // action runner (dry-run → confirm → apply). Legacy `actions: string[]`
  // stays for human-readable summary lines.
  plan?: ActionPlan;
  /** Raw LLM output — useful for debug, /audit and for /plan to display
   * the agent's rationale even when the plan is empty. */
  rawText?: string;
}

export interface AgentRole {
  name: AgentType;
  description: string;
  run(task: string, ctx: AgentContext): Promise<AgentResult>;
  getSystemPrompt(ctx: AgentContext): string;
}
