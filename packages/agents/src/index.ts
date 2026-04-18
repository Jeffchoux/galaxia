// GALAXIA Agents — re-exports
export type { AgentContext, AgentResult, AgentRole } from './types.js';

// AgentRunner — facade for CLI to run agents by type name
export { AgentRunner } from './runner.js';

// Registry — direct access used by @galaxia/telegram to dispatch a role
// instance by its AgentType. Throws if the type is not a known built-in.
export { getAgent, getAllAgents, registerAgent } from './registry.js';
