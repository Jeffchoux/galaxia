// GALAXIA AgentRunner — facade for running agents by type name

import type { AgentResult } from './types.js';

export class AgentRunner {
  private config: unknown;

  constructor(config: unknown) {
    this.config = config;
  }

  async runAgent(type: string, task: string): Promise<AgentResult> {
    // Stub implementation — will dispatch to specific agent roles
    // when base-agent, registry, and role modules are built
    return {
      success: false,
      summary: `Agent "${type}" not yet implemented. Task: ${task}`,
      actions: [],
      knowledgeLearned: [],
      errors: [`Agent ${type} is a stub — implement in packages/agents/src/roles/${type}.ts`],
    };
  }
}
