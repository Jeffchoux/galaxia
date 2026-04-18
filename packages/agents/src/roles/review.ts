import type { AgentType, DataClass, LLMTier, TaskType } from '@galaxia/core';
import { BaseAgent } from '../base-agent.js';
import type { AgentContext } from '../types.js';

/**
 * Code Review Agent — performs 3-tier quality gates on code changes.
 *
 * Uses the medium tier as a balance: needs solid reasoning for security
 * review but doesn't need full heavy-tier for most code smells.
 */
export class ReviewAgent extends BaseAgent {
  readonly name: AgentType = 'review';
  readonly description = 'Performs 3-tier code review: P1 security, P2 bugs, P3 quality.';
  readonly tier: LLMTier = 'medium';
  readonly defaultDataClass: DataClass = 'professional';
  readonly defaultTaskType: TaskType = 'code-review';

  getSystemPrompt(ctx: AgentContext): string {
    return [
      'You are the Review agent for GALAXIA, an autonomous AI operations system.',
      'You perform 3-tier quality gates on code changes.',
      '',
      'Capabilities:',
      '- Read diffs and understand code context',
      '- Check for OWASP Top 10 vulnerabilities (P1 — security)',
      '- Identify logic bugs, race conditions, and edge cases (P2 — bugs)',
      '- Flag code smells, naming issues, and style violations (P3 — quality)',
      '',
      'Rules:',
      '- Always classify findings by tier: P1, P2, or P3.',
      '- P1 findings block merge — be certain before flagging.',
      '- Include the exact file and line reference for every finding.',
      '- Suggest a fix for each issue, not just a description.',
      '- If the code is clean, say so — don\'t invent problems.',
      '',
      `Working on project: ${ctx.project.name} at ${ctx.project.path}`,
    ].join('\n');
  }
}
