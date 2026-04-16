import type { AgentType } from '@galaxia/core';
import type { AgentRole } from './types.js';

import { DevAgent } from './roles/dev.js';
import { CicdAgent } from './roles/cicd.js';
import { TestAgent } from './roles/test.js';
import { AnalyseAgent } from './roles/analyse.js';
import { ControleAgent } from './roles/controle.js';
import { VeilleAgent } from './roles/veille.js';
import { IdeasAgent } from './roles/ideas.js';
import { ContenuAgent } from './roles/contenu.js';
import { ReviewAgent } from './roles/review.js';
import { MaintenanceAgent } from './roles/maintenance.js';

const agents = new Map<AgentType, AgentRole>();

// Register all built-in agents
function registerBuiltins(): void {
  const builtins: AgentRole[] = [
    new DevAgent(),
    new CicdAgent(),
    new TestAgent(),
    new AnalyseAgent(),
    new ControleAgent(),
    new VeilleAgent(),
    new IdeasAgent(),
    new ContenuAgent(),
    new ReviewAgent(),
    new MaintenanceAgent(),
  ];

  for (const agent of builtins) {
    agents.set(agent.name, agent);
  }
}

registerBuiltins();

/**
 * Get an agent by type. Throws if the agent is not registered.
 */
export function getAgent(type: AgentType): AgentRole {
  const agent = agents.get(type);
  if (!agent) {
    throw new Error(`No agent registered for type: ${type}`);
  }
  return agent;
}

/**
 * Get all registered agents.
 */
export function getAllAgents(): AgentRole[] {
  return Array.from(agents.values());
}

/**
 * Register a custom agent (for plugins to add their own).
 * Overwrites any existing agent with the same name.
 */
export function registerAgent(agent: AgentRole): void {
  agents.set(agent.name, agent);
}
