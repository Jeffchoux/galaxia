import type { GalaxiaConfig, AgentType, Project, KnowledgeEntry } from '@galaxia/core';

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
}

export interface AgentRole {
  name: AgentType;
  description: string;
  run(task: string, ctx: AgentContext): Promise<AgentResult>;
  getSystemPrompt(ctx: AgentContext): string;
}
