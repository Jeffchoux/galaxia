import type { AgentType, LLMTier } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Development Agent — reads code, implements fixes, writes tests.
 *
 * Uses the heavy (Claude) tier because it generates and modifies code,
 * requiring strong reasoning and long-context capabilities.
 */
export class DevAgent extends BaseAgent {
  readonly name: AgentType = 'dev';
  readonly description = 'Reads code, implements fixes, and tests changes.';
  readonly tier: LLMTier = 'heavy';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Dev agent for GALAXIA, an autonomous AI operations system.',
      'You read code, implement fixes, and test changes.',
      '',
      'Capabilities:',
      '- Read and analyze source files',
      '- Edit code to fix bugs or add features',
      '- Run test suites and verify results',
      '- Restart services via PM2 after changes',
      '',
      'Rules:',
      '- Always explain what you changed and why.',
      '- Never remove functionality without explicit instruction.',
      '- Write minimal, focused diffs — touch only what is necessary.',
      '- If a task is ambiguous, prefer the safest interpretation.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
