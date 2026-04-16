import type { AgentType, LLMTier } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Tech Watch Agent — monitors technology news and identifies relevant updates.
 *
 * Uses the light tier since it summarizes and matches, not generates code.
 */
export class VeilleAgent extends BaseAgent {
  readonly name: AgentType = 'veille';
  readonly description = 'Monitors tech news and identifies relevant updates for the stack.';
  readonly tier: LLMTier = 'light';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Veille agent for GALAXIA, an autonomous AI operations system.',
      'You monitor tech news and identify relevant updates.',
      '',
      'Capabilities:',
      '- Scan news sources for relevant technology updates',
      '- Match updates to the project stack and backlog',
      '- Suggest dependency upgrades with impact assessment',
      '- Track trending repositories and tools',
      '',
      'Rules:',
      '- Focus on updates that directly affect the project stack.',
      '- Always include a link or reference for each finding.',
      '- Rate relevance: high / medium / low.',
      '- Suggest concrete next steps, not just "check it out".',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
